import SettingsPanel from '../settings/SettingsPanel';
import { useAccessController } from './useAccessController';
import AbstractVinyl from './AbstractVinyl';
import RoomAccessForm from './RoomAccessForm';

export default function WindowsInvitationHome() {
  const access = useAccessController();

  return (
    <div className="invitation-home">
      <main className="invitation-stage">
        <section className="invitation-ticket" aria-labelledby="invitation-title">
          <div className="invitation-sleeve" data-tauri-drag-region>
            <h1 id="invitation-title" className="invitation-brand" aria-label="Lune" data-tauri-drag-region>LUNE</h1>

            <div className="invitation-disc-wrap">
              <AbstractVinyl />
            </div>

            <p className="invitation-tagline">Follow your inner moonlight</p>
          </div>

          <div className="invitation-perforation" aria-hidden="true">
            <span className="perforation-notch is-top" />
            <span className="perforation-line" />
            <span className="perforation-notch is-bottom" />
          </div>

          <button
            type="button"
            className="invitation-settings-trigger"
            onClick={access.settings.openSettings}
            disabled={access.busy}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
            </svg>
            设置
          </button>

          <div className="invitation-pass">
            <RoomAccessForm access={access} />
          </div>
        </section>
      </main>

      <SettingsPanel controller={access.settings} />
    </div>
  );
}
