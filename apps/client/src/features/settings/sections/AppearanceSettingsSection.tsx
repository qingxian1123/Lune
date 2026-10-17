import { useTheme } from '../../../app/ThemeProvider';
import type { ThemeId } from '../../../app/ThemeProvider';
import './appearance.css';

const choices: { id: ThemeId; name: string }[] = [
  { id: 'moonlight', name: '午夜月室' },
  { id: 'daylight', name: '悦动白昼' },
  { id: 'frosted', name: '雾面唱片' },
];

export default function AppearanceSettingsSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="settings-form appearance-settings" aria-labelledby="appearance-title">
      <h2 id="appearance-title">外观</h2>
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
            <span className="appearance-option-copy"><strong>{choice.name}</strong></span>
            <span className="appearance-radio" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
