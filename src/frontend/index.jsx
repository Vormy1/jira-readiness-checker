import React, { useEffect, useState } from 'react';
import ForgeReconciler, { 
  Text, Stack, Heading, ProgressBar, Strong, 
  Button, Modal, ModalBody, ModalHeader, ModalFooter, ModalTitle, 
  Checkbox, ModalTransition, Lozenge, DynamicTable, Icon, SectionMessage, Box, Badge
} from '@forge/react';
import { requestJira, view, invoke } from '@forge/bridge';

const App = () => {
  // --- STATE ---
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null); 
  const [loading, setLoading] = useState(true);
  
  // UI States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false); 

  // AI States
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  // --- LOGIC ---

  const fetchData = async () => {
    setLoading(true);
    let currentSettings = settings;
    if (!currentSettings) {
       currentSettings = await invoke('getSettings');
       setSettings(currentSettings);
    }

    const context = await view.getContext();
    const issueId = context.extension.issue.id;

    const response = await requestJira(`/rest/api/3/issue/${issueId}`);
    const issueData = await response.json();
    const fields = issueData.fields;

    const aiContext = {
        summary: fields.summary,
        description: fields.description, 
        type: fields.issuetype.name
    };

    const checks = [];

    if (currentSettings.checkDescription) {
      const hasDesc = fields.description !== null; 
      checks.push({
        name: "Description",
        isReady: hasDesc, 
        isCritical: true,
        msg: hasDesc ? "Заполнено" : "Критично: Нет описания"
      });
    }

    if (currentSettings.checkAssignee) {
      checks.push({
        name: "Assignee",
        isReady: fields.assignee !== null,
        isCritical: true, 
        msg: fields.assignee ? fields.assignee.displayName : "Критично: Не назначен",
        canFix: true, 
        fixType: 'assignMe'
      });
    }

    if (currentSettings.checkPriority) {
      checks.push({
        name: "Priority",
        isReady: fields.priority && fields.priority.name !== "Undefined",
        isCritical: false,
        msg: fields.priority ? fields.priority.name : "Укажите приоритет"
      });
    }

    if (currentSettings.checkLabels) {
      checks.push({
        name: "Labels",
        isReady: fields.labels && fields.labels.length > 0,
        isCritical: false,
        msg: fields.labels && fields.labels.length > 0 ? "Есть метки" : "Желательно добавить"
      });
    }

    const passedCount = checks.filter(c => c.isReady).length;
    const totalCount = checks.length;
    const hasCriticalError = checks.some(c => c.isCritical && !c.isReady);
    const score = totalCount === 0 ? 1 : passedCount / totalCount; 

    setData({ checks, score, hasCriticalError, aiContext });
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- AI FUNCTION ---
  const runAiAnalysis = async () => {
      setAiLoading(true);
      setAiResult(null); 
      try {
          const result = await invoke('analyzeIssue', {
              summary: data.aiContext.summary,
              description: data.aiContext.description,
              type: data.aiContext.type
          });
          setAiResult(result);
      } catch (error) {
          console.error(error);
          setAiResult({ error: "Ошибка соединения с AI. Проверьте API Key." });
      } finally {
          setAiLoading(false);
      }
  };

  // --- ACTIONS ---
  const assignToMe = async () => {
    setIsAssigning(true);
    try {
        const context = await view.getContext();
        const issueId = context.extension.issue.id;
        const meResponse = await requestJira('/rest/api/3/myself');
        const meData = await meResponse.json();
        
        await requestJira(`/rest/api/3/issue/${issueId}/assignee`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: meData.accountId })
        });
        fetchData();
    } catch (error) { console.error(error); } finally { setIsAssigning(false); }
  };

  // --- SETTINGS ---
  const openSettingsModal = () => { setTempSettings({ ...settings }); setIsSettingsOpen(true); };
  const toggleSetting = (key) => setTempSettings(prev => ({ ...prev, [key]: !prev[key] }));
  const saveSettings = async () => {
    await invoke('saveSettings', tempSettings);
    setSettings(tempSettings);
    setIsSettingsOpen(false);
    window.location.reload(); 
  };

  // Helper для получения цвета точки AI
  const getAiScoreDot = (score) => {
    if (score >= 80) return "🟢"; // Green
    if (score >= 50) return "🟡"; // Yellow
    return "🔴"; // Red
  };

  if (loading || !settings) {
    return <Text>Loading...</Text>;
  }

  // --- UI RENDER ---
  return (
    <Stack space="space.300">
      
      {/* 1. MAIN SCORE HEADER */}
      <Stack direction="row" alignInline="spread" alignBlock="center">
        <Heading as="h3">Technical Score: {Math.round(data.score * 100)}%</Heading>
        <Stack direction="row" space="space.050">
            <Button appearance="subtle" onClick={fetchData}><Icon glyph="refresh" label="Refresh" /></Button>
            <Button appearance="subtle" onClick={openSettingsModal}><Icon glyph="settings" label="Settings" /></Button>
        </Stack>
      </Stack>

      <ProgressBar 
        value={data.score} 
        appearance={data.score === 1 ? 'success' : (data.hasCriticalError ? 'danger' : 'warning')} 
      />

      {data.hasCriticalError && (
          <SectionMessage appearance="error" title="Technical Blocker">
              <Text>Fix critical fields (Assignee/Description) first.</Text>
          </SectionMessage>
      )}

      {/* 2. RULES TABLE */}
      <DynamicTable
        head={{
            cells: [
                { key: 's', content: 'Status', isSortable: false },
                { key: 'r', content: 'Rule', isSortable: false },
                { key: 'd', content: 'Details', isSortable: false },
            ]
        }}
        rows={data.checks.map((check, index) => ({
          key: `row-${index}`,
          cells: [
            { key: 's', content: <Lozenge appearance={check.isReady ? 'success' : (check.isCritical ? 'removed' : 'inprogress')}>{check.isReady ? 'OK' : 'FIX'}</Lozenge> },
            { key: 'r', content: <Strong>{check.name}</Strong> },
            { key: 'd', content: <Stack direction="row" alignBlock="center" space="space.100"><Text>{check.msg}</Text>{!check.isReady && check.canFix && (<Button appearance="primary" spacing="compact" isLoading={isAssigning} onClick={assignToMe}>Взять себе</Button>)}</Stack> },
          ],
        }))}
      />

      {/* 3. ✨ AI ANALYSIS SECTION ✨ */}
      <Box padding="space.200" backgroundColor="color.background.neutral.subtle" borderRadius="border.radius">
          <Stack space="space.200">
              
            {/* ЗАГОЛОВОК + ОЦЕНКА В ОДНУ СТРОКУ */}
              <Stack direction="row" alignInline="spread" alignBlock="center">
                  {/* ВАЖНО: Всё внутри одного Text, чтобы не было переноса строки */}
                  <Text>
                     <Strong>🧠 AI Check</Strong>
                     {aiResult && !aiResult.error && (
                         <Text> &nbsp; {getAiScoreDot(aiResult.score)} {aiResult.score}%</Text>
                     )}
                  </Text>
                  
                  {/* КНОПКА СПРАВА */}
                  <Button onClick={runAiAnalysis} appearance="primary" isLoading={aiLoading}>
                      {aiResult ? "Re-analyze" : "✨ Analyze with AI"}
                  </Button>
              </Stack>

              {/* РЕЗУЛЬТАТЫ АНАЛИЗА */}
              {aiResult && !aiResult.error && (
                  <Stack space="space.300">
                      
                      {/* Анализ (Текст) */}
                      <Text>{aiResult.analysis}</Text>

                      {/* Чего не хватает */}
                      {aiResult.missing && aiResult.missing.length > 0 && (
                          <SectionMessage title="Recommendations" appearance="warning">
                              <Stack space="space.050">
                                  {aiResult.missing.map((item, i) => (
                                      <Text key={i}>• {item}</Text>
                                  ))}
                              </Stack>
                          </SectionMessage>
                      )}

                      {/* Вопросы */}
                      {aiResult.questions && aiResult.questions.length > 0 && (
                          <SectionMessage title="Questions to Reporter" appearance="information">
                              <Stack space="space.050">
                                  {aiResult.questions.map((q, i) => (
                                      <Text key={i}>? {q}</Text>
                                  ))}
                              </Stack>
                          </SectionMessage>
                      )}
                  </Stack>
              )}

              {/* ОШИБКА */}
              {aiResult && aiResult.error && (
                  <SectionMessage appearance="error" title="AI Error">
                      <Text>{aiResult.error}</Text>
                  </SectionMessage>
              )}
          </Stack>
      </Box>

      {/* SETTINGS MODAL */}
      <ModalTransition>
        {isSettingsOpen && tempSettings && (
          <Modal onClose={() => setIsSettingsOpen(false)}>
              <ModalHeader><ModalTitle>Settings</ModalTitle></ModalHeader>
              <ModalBody>
                <Stack space="space.100">
                    <Checkbox isChecked={tempSettings.checkDescription} onChange={() => toggleSetting('checkDescription')} label="Check Description" />
                    <Checkbox isChecked={tempSettings.checkAssignee} onChange={() => toggleSetting('checkAssignee')} label="Check Assignee" />
                    <Checkbox isChecked={tempSettings.checkPriority} onChange={() => toggleSetting('checkPriority')} label="Check Priority" />
                    <Checkbox isChecked={tempSettings.checkLabels} onChange={() => toggleSetting('checkLabels')} label="Check Labels" />
                </Stack>
              </ModalBody>
              <ModalFooter>
                  <Button appearance="subtle" onClick={() => setIsSettingsOpen(false)}>Cancel</Button>
                  <Button appearance="primary" onClick={saveSettings}>Save</Button>
              </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);