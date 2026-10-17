import { useTheme } from '../../../app/ThemeProvider';
import type { ThemeId } from '../../../app/ThemeProvider';
import './appearance.css';

const choices: { id: ThemeId; name: string; description: string }[] = [
  { id: 'moonlight', name: '午夜月室', description: '深色画布与薰衣月光' },
  { id: 'daylight', name: '悦动白昼', description: '明亮界面与专辑色彩' },
  { id: 'frosted', name: '雾面唱片', description: '磨砂玻璃与专辑剪影' },
];

export default function AppearanceSettingsSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="settings-form appearance-settings" aria-labelledby="appearance-title">
      <h2 id="appearance-title">外观</h2>
      <p className="appearance-intro">选择适合此刻的听歌界面。切换后立即生效，并保存在这台设备上。</p>
      <div className="appearance-options" role="group" aria-label="界面样式">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            aria-pressed={theme === choice.id}
            className={`appearance-option ${theme === choice.id ? 'is-selected' : ''}`}
            onClick={() => setTheme(choice.id)}
          >
            <span className={`appearance-preview appearance-preview-${choice.id}`} aria-hidden="true">
              <span className="appearance-preview-sidebar" />
              <span className="appearance-preview-album" />
              <span className="appearance-preview-lines"><i /><i /><i /></span>
            </span>
            <span className="appearance-option-copy"><strong>{choice.name}</strong><small>{choice.description}</small></span>
            <span className="appearance-radio" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
