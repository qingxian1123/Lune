import { useId, useState } from 'react';
import type { BilibiliSearchPrecision } from '@lune/shared';
import { useBilibiliPreferences } from '../model/bilibiliPreferences';

const options: Record<BilibiliSearchPrecision, string> = { strict: '严格', balanced: '均衡', broad: '宽松' };

export default function BilibiliSettingsSection() {
  const id = useId();
  const { precision, setPrecision } = useBilibiliPreferences();
  const [error, setError] = useState(false);
  return <section className="settings-form" aria-labelledby={id}>
    <h2 id={id}>哔哩哔哩</h2>
    <label className="settings-field">
      <span>B 站搜索精度</span>
      <select value={precision} className="lune-control rounded-lg px-3 py-2"
        onChange={(event) => setError(!setPrecision(event.target.value as BilibiliSearchPrecision))}>
        {Object.entries(options).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
    </label>
    {error && <p role="alert">无法保存搜索精度，请重试。</p>}
  </section>;
}
