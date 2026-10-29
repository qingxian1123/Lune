import { useColorScheme } from '../../../app/ThemeProvider';
import type { ColorScheme } from '../model/preferenceMigration';
import './appearance.css';

const choices: { id: ColorScheme; name: string }[] = [
  { id: 'dark', name: '深色' },
  { id: 'light', name: '浅色' },
];

export default function AppearanceSettingsSection() {
  const { color, setColor } = useColorScheme();

  return (
    <section className="settings-form appearance-settings" aria-labelledby="appearance-title">
      <h2 id="appearance-title">配色</h2>
      <div className="appearance-options" role="group" aria-label="配色">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            aria-pressed={color === choice.id}
            className={`appearance-option ${color === choice.id ? 'is-selected' : ''}`}
            onClick={() => setColor(choice.id)}
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
