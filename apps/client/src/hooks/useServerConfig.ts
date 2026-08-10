import { useCallback, useState } from 'react';
import {
  getInitialServerUrl,
  saveServerUrl,
  testServerConnection,
} from '../lib/serverConfig';

export type ConnectionState = 'idle' | 'testing' | 'ready' | 'error';

export function useServerConfig() {
  const [serverUrl, setServerUrlState] = useState(getInitialServerUrl);
  const [state, setState] = useState<ConnectionState>('idle');
  const [message, setMessage] = useState(
    serverUrl ? '已保存' : '请输入服务器地址',
  );

  const setServerUrl = useCallback((value: string) => {
    setServerUrlState(value);
    setState('idle');
    setMessage(value.trim() ? '请测试连接' : '请输入服务器地址');
  }, []);

  const verify = useCallback(async () => {
    setState('testing');
    setMessage('正在测试连接');
    try {
      const result = await testServerConnection(serverUrl);
      const normalized = saveServerUrl(result.url);
      setServerUrlState(normalized);
      setState('ready');
      const readyCount = result.health.providers?.filter((provider) => provider.status === 'ready').length;
      setMessage(
        readyCount === undefined
          ? '连接成功'
          : `已连接 · ${readyCount} 个音源`,
      );
      return normalized;
    } catch (error) {
      const reason = error instanceof Error ? error.message : '无法连接服务器';
      setState('error');
      setMessage(reason);
      throw error;
    }
  }, [serverUrl]);

  return { serverUrl, setServerUrl, state, message, verify };
}
