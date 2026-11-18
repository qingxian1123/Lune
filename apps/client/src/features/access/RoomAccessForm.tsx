import { useEffect, useId, useRef } from 'react';
import type { AccessController, AccessError } from './useAccessController';

interface RoomAccessFormProps {
  access: AccessController;
}

export default function RoomAccessForm({ access }: RoomAccessFormProps) {
  const id = useId();
  const { error, settings, busy } = access;
  const nameInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const serverInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (busy || settings.open) return;
    if (error?.field === 'nickname') nameInput.current?.focus();
    else if (error?.field === 'roomCode') codeInput.current?.focus();
    else if (settings.serverError && access.showServer) serverInput.current?.focus();
  }, [access.showServer, busy, error, settings.open, settings.serverError]);

  type Field = NonNullable<AccessError['field']> | 'server';
  const fieldError = (field: Field) =>
    field === 'server' ? settings.serverError : error?.field === field ? error?.message : undefined;
  const errorProps = (field: Field) => ({
    'aria-invalid': Boolean(fieldError(field)),
    'aria-describedby': fieldError(field) ? `${id}-${field}-error` : undefined,
  });
  const renderError = (field: Field) => fieldError(field) && (
    <small id={`${id}-${field}-error`} className="invitation-error" role="alert">
      {fieldError(field)}
    </small>
  );

  return (
    <form className="invitation-form" noValidate
      onSubmit={(event) => { event.preventDefault(); void access.enterRoom(); }}>
      <label className="invitation-field">
        <span className="invitation-field-head">昵称</span>
        <input ref={nameInput} value={access.nickname} onChange={(event) => access.setNickname(event.target.value)}
          maxLength={32} autoComplete="nickname" autoFocus={!access.nickname} required
          readOnly={busy} {...errorProps('nickname')} />
        {renderError('nickname')}
      </label>
      <label className="invitation-field">
        <span className="invitation-field-head"><span>房间码</span><em>选填</em></span>
        <input ref={codeInput} value={access.roomCode} onChange={(event) => access.setRoomCode(event.target.value)}
          className="invitation-code-input" autoCapitalize="characters" autoComplete="off"
          spellCheck={false} placeholder="输入 6 位房间码加入" autoFocus={Boolean(access.nickname)}
          readOnly={busy} {...errorProps('roomCode')} />
        {renderError('roomCode')}
      </label>
      {access.showServer && (
        <label className="invitation-field">
          <span className="invitation-field-head">服务器地址</span>
          <input ref={serverInput} value={settings.serverUrl} onChange={(event) => settings.setServerUrl(event.target.value)}
            inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} readOnly={busy}
            placeholder="输入朋友或管理员给你的地址" required {...errorProps('server')} />
          {renderError('server')}
        </label>
      )}
      {error && !error.field && <p className="invitation-alert" role="alert">{error.message}</p>}
      <button type="submit" className="invitation-submit" disabled={busy || settings.serverState === 'testing'}>
        <span role="status">{busy
          ? settings.serverState === 'testing' ? '正在连接服务器…' : access.roomCode ? '正在加入…' : '正在创建…'
          : access.roomCode ? '加入房间' : '创建房间'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
      </button>
    </form>
  );
}
