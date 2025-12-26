import Resolver from '@forge/resolver';
import { storage } from '@forge/api';

const resolver = new Resolver();

// The storage key is configured
const SETTINGS_KEY = 'readiness-settings';

// Default values
const DEFAULT_SETTINGS = {
  checkDescription: true,
  checkAssignee: true,
  checkPriority: true,
  checkLabels: true
};

// Function 1: Get Settings
resolver.define('getSettings', async () => {
  // Get it from the database
  const stored = await storage.get(SETTINGS_KEY);
  // If there are no default values in the database
  return stored || DEFAULT_SETTINGS;
});

// Function 2: Save settings
resolver.define('saveSettings', async (req) => {
  await storage.set(SETTINGS_KEY, req.payload);
  return req.payload;
});

export const handler = resolver.getDefinitions();
