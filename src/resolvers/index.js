import Resolver from '@forge/resolver';
import { storage, fetch } from '@forge/api';

const resolver = new Resolver();
const SETTINGS_KEY = 'readiness-settings';
const DEFAULT_SETTINGS = {
  checkDescription: true,
  checkAssignee: true,
  checkPriority: true,
  checkLabels: true
};

resolver.define('getSettings', async () => {
  const stored = await storage.get(SETTINGS_KEY);
  return stored || DEFAULT_SETTINGS;
});

resolver.define('saveSettings', async (req) => {
  await storage.set(SETTINGS_KEY, req.payload);
  return req.payload;
});

resolver.define('analyzeIssue', async (req) => {
  let { summary, description, type } = req.payload;

  if (!description) {
     return {
         score: 0,
         analysis: "Описание отсутствует.",
         missing: ["Полное описание задачи"],
         questions: ["О чем эта задача?"]
     };
  }

  if (typeof description === 'object') {
      description = JSON.stringify(description);
  }

  if (typeof description === 'string' && description.trim().length === 0) {
      return {
         score: 0,
         analysis: "Описание пустое.",
         missing: ["Описание задачи"],
         questions: ["Заполните детали задачи"]
     };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
      console.error("API Key is missing");
      return { error: "API Key не найден. Введите: forge variables set OPENAI_API_KEY ..." };
  }

  const prompt = `
    Ты опытный QA Lead. Проанализируй задачу Jira.
    Тип: ${type}
    Заголовок: ${summary}
    Описание: ${description}

    Твоя цель:
    1. Оцени качество (0-100).
    2. Если < 100, напиши, чего не хватает.
    3. Задай 3 вопроса.
    
    Верни ТОЛЬКО JSON:
    {
       "score": number,
       "analysis": "короткий вывод",
       "missing": ["пункт 1", "пункт 2"],
       "questions": ["вопрос 1", "вопрос 2"]
    }
  `;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "You represent a JSON structure." },
            { role: "user", content: prompt }
        ],
        temperature: 0.3
        })
    });

    if (response.status !== 200) {
        throw new Error(`OpenAI API Error: Status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);

  } catch (error) {
      console.error("AI Error:", error);
      return { error: "Ошибка при запросе к ИИ. См. логи." };
  }
});

export const handler = resolver.getDefinitions();