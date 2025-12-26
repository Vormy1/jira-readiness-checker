import Resolver from '@forge/resolver';
import { storage } from '@forge/api';

const resolver = new Resolver();

// Ключ хранения настроеик
const SETTINGS_KEY = 'readiness-settings';

// Значения по умолчанию 
const DEFAULT_SETTINGS = {
  checkDescription: true,
  checkAssignee: true,
  checkPriority: true,
  checkLabels: true
};

// Функция 1: Получить настройки
resolver.define('getSettings', async () => {
  // Достать из базы
  const stored = await storage.get(SETTINGS_KEY);
  // Если в базе нет то дефолтные
  return stored || DEFAULT_SETTINGS;
});

// Функция 2: Сохранить настройки
resolver.define('saveSettings', async (req) => {
  await storage.set(SETTINGS_KEY, req.payload);
  return req.payload;
});

export const handler = resolver.getDefinitions();
