import Resolver from '@forge/resolver';
import { storage } from '@forge/api';

const resolver = new Resolver();

// Ключ, по которому будем хранить настройки
const SETTINGS_KEY = 'readiness-settings';

// Значения по умолчанию (если настройки еще не сохраняли)
const DEFAULT_SETTINGS = {
  checkDescription: true,
  checkAssignee: true,
  checkPriority: true,
  checkLabels: true
};

// Функция 1: Получить настройки
resolver.define('getSettings', async () => {
  // Пытаемся достать из базы
  const stored = await storage.get(SETTINGS_KEY);
  // Если в базе пусто, возвращаем дефолтные
  return stored || DEFAULT_SETTINGS;
});

// Функция 2: Сохранить настройки
resolver.define('saveSettings', async (req) => {
  // req.payload — это то, что прислал фронтенд
  await storage.set(SETTINGS_KEY, req.payload);
  return req.payload;
});

export const handler = resolver.getDefinitions();