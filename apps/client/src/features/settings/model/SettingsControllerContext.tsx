import { createContext, useContext } from 'react';
import type { SettingsController } from './types';

export const SettingsControllerContext = createContext<SettingsController | null>(null);

export function useSettingsControllerContext(): SettingsController {
  const controller = useContext(SettingsControllerContext);
  if (!controller) throw new Error('SettingsControllerContext is missing');
  return controller;
}
