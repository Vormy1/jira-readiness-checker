import React, { useEffect, useState } from 'react';
import ForgeReconciler, { 
  Text, Stack, Heading, ProgressBar, Strong, 
  Button, Modal, ModalBody, ModalHeader, ModalFooter, ModalTitle, 
  Checkbox, ModalTransition, Lozenge, DynamicTable, Icon, SectionMessage 
} from '@forge/react';
import { requestJira, view, invoke } from '@forge/bridge';

const App = () => {
  // --- СОСТОЯНИЯ ---
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null); 
  const [loading, setLoading] = useState(true);
  
  // Состояния UI
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false); 

  // --- ЛОГИКА ---

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Настройки
    let currentSettings = settings;
    if (!currentSettings) {
       currentSettings = await invoke('getSettings');
       setSettings(currentSettings);
    }

    // 2. Контекст
    const context = await view.getContext();
    const issueId = context.extension.issue.id;

    // 3. Запрос данных задачи
    const response = await requestJira(`/rest/api/3/issue/${issueId}`);
    const issueData = await response.json();
    const fields = issueData.fields;

    // 4. Формируем правила с учетом критичнности
    const checks = [];

    // Правило: Описание (Critical)
    if (currentSettings.checkDescription) {
      const hasDesc = fields.description !== null; 
      checks.push({
        name: "Description",
        isReady: hasDesc, 
        isCritical: true,
        msg: hasDesc ? "Заполнено" : "Критично: Нет описания"
      });
    }

    // Правило: Исполнитель (Critical)
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

    // Правило: Приоритет (Normal)
    if (currentSettings.checkPriority) {
      checks.push({
        name: "Priority",
        isReady: fields.priority && fields.priority.name !== "Undefined",
        isCritical: false,
        msg: fields.priority ? fields.priority.name : "Укажите приоритет"
      });
    }

    // Правило: Метки (Optional / Warning)
    if (currentSettings.checkLabels) {
      checks.push({
        name: "Labels",
        isReady: fields.labels && fields.labels.length > 0,
        isCritical: false,
        msg: fields.labels && fields.labels.length > 0 ? "Есть метки" : "Желательно добавить"
      });
    }

    // 5. Умный расчет статуса
    const passedCount = checks.filter(c => c.isReady).length;
    const totalCount = checks.length;
    
    // Если есть хоть одна КРИТИЧЕСКАЯ ошибка
    const hasCriticalError = checks.some(c => c.isCritical && !c.isReady);
    
    // Score считаем как и раньше (с заменой цвета)
    const score = totalCount === 0 ? 1 : passedCount / totalCount; 

    setData({ checks, score, hasCriticalError });
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ACTIONS (Быстрые действия)

  // Функция "Взять задачу на себя"
  const assignToMe = async () => {
    setIsAssigning(true);
    try {
        // 1. Узнаем ID текущего задачи
        const context = await view.getContext();
        const issueId = context.extension.issue.id;

        // 2. Узнаем ID текущего пользователя (кто кликнул)
        const meResponse = await requestJira('/rest/api/3/myself');
        const meData = await meResponse.json();
        const myAccountId = meData.accountId;

        // 3. Назначаем задачу
        await requestJira(`/rest/api/3/issue/${issueId}/assignee`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                accountId: myAccountId
            })
        });

        // 4. Обновляем данные
        fetchData();

    } catch (error) {
        console.error("Ошибка назначения", error);
    } finally {
        setIsAssigning(false);
    }
  };

  // --- SETTINGS LOGIC ---
  const openSettingsModal = () => { setTempSettings({ ...settings }); setIsSettingsOpen(true); };
  const toggleSetting = (key) => setTempSettings(prev => ({ ...prev, [key]: !prev[key] }));
  const saveSettings = async () => {
    await invoke('saveSettings', tempSettings);
    setSettings(tempSettings);
    setIsSettingsOpen(false);
    window.location.reload(); 
  };

  if (loading || !settings) {
    return <Text>Loading...</Text>;
  }

  // --- UI RENDER ---
  return (
    <Stack space="space.200">
      
      {/* Шапка */}
      <Stack direction="row" alignInline="spread" alignBlock="center">
        <Heading as="h3">Score: {Math.round(data.score * 100)}%</Heading>
        <Stack direction="row" space="space.050">
            <Button appearance="subtle" onClick={fetchData}><Icon glyph="refresh" label="Refresh" /></Button>
            <Button appearance="subtle" onClick={openSettingsModal}><Icon glyph="settings" label="Settings" /></Button>
        </Stack>
      </Stack>

      {/* Бар прогресса меняет цвет */}
      <ProgressBar 
        value={data.score} 
        appearance={data.score === 1 ? 'success' : (data.hasCriticalError ? 'danger' : 'warning')} 
      />

      {/* Сообщение, если всё плохо */}
      {data.hasCriticalError && (
          <SectionMessage appearance="error" title="Задача не готова">
              <Text>Исправьте критические ошибки перед началом работы.</Text>
          </SectionMessage>
      )}

      {/* Таблица */}
      <DynamicTable
        head={{
          cells: [
            { key: 'status', content: 'Status', isSortable: false },
            { key: 'rule', content: 'Rule', isSortable: false },
            { key: 'details', content: 'Details / Action', isSortable: false },
          ],
        }}
        rows={data.checks.map((check, index) => ({
          key: `row-${index}`,
          cells: [
            {
              key: 'status',
              content: (
                <Lozenge appearance={
                    check.isReady ? 'success' : (check.isCritical ? 'removed' : 'inprogress')
                }>
                  {check.isReady ? 'OK' : (check.isCritical ? 'CRITICAL' : 'WARNING')}
                </Lozenge>
              ),
            },
            {
              key: 'rule',
              content: <Strong>{check.name}</Strong>,
            },
            {
              key: 'details',
              content: (
                 <Stack direction="row" alignBlock="center" space="space.100">
                    <Text>{check.msg}</Text>
                    {/* Кнопка "Assign Me", если это Assignee и он пустой */}
                    {!check.isReady && check.canFix && check.fixType === 'assignMe' && (
                        <Button 
                            appearance="primary" 
                            spacing="compact" 
                            isLoading={isAssigning}
                            onClick={assignToMe}
                        >
                            Взять себе
                        </Button>
                    )}
                 </Stack>
              ),
            },
          ],
        }))}
      />

      {/* MODAL SETTINGS */}
      <ModalTransition>
        {isSettingsOpen && tempSettings && (
          <Modal onClose={() => setIsSettingsOpen(false)}>
              <ModalHeader><ModalTitle>Настройки</ModalTitle></ModalHeader>
              <ModalBody>
                <Stack space="space.100">
                    <Checkbox isChecked={tempSettings.checkDescription} onChange={() => toggleSetting('checkDescription')} label="Требовать Описание" />
                    <Checkbox isChecked={tempSettings.checkAssignee} onChange={() => toggleSetting('checkAssignee')} label="Требовать Исполнителя" />
                    <Checkbox isChecked={tempSettings.checkPriority} onChange={() => toggleSetting('checkPriority')} label="Требовать Приоритет" />
                    <Checkbox isChecked={tempSettings.checkLabels} onChange={() => toggleSetting('checkLabels')} label="Требовать Метки" />
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button appearance="subtle" onClick={() => setIsSettingsOpen(false)}>Отмена</Button>
                <Button appearance="primary" onClick={saveSettings}>Сохранить</Button>
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
