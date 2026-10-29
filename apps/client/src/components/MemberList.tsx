import type { Member } from '@lune/shared';

interface MemberListProps {
  members: Member[];
  ownerId: string;
  presentation?: 'compact' | 'workspace';
}

function initialOf(nickname: string) {
  return nickname.trim().slice(0, 1).toUpperCase() || 'L';
}

export default function MemberList({ members, ownerId, presentation = 'compact' }: MemberListProps) {
  if (presentation === 'workspace') {
    return (
      <ul className="workspace-member-list">
        {members.map((member) => {
          const owner = member.id === ownerId || member.isOwner;
          return (
            <li key={member.id} className="workspace-member-row">
              <span className="workspace-member-avatar" aria-hidden="true">{initialOf(member.nickname)}</span>
              <strong>{member.nickname}</strong>
              <span className="workspace-member-role">{owner ? '房主' : '成员'}</span>
              <i className="workspace-member-status" aria-hidden="true" />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="terminal-pane">
      <div className="pane-heading">
        <div><strong>房间成员</strong></div>
        <small>{members.length} 人在线</small>
      </div>
      <ul className="member-terminal-list">
        {members.map((member) => {
          const owner = member.id === ownerId || member.isOwner;

          return (
            <li
              key={member.id}
              className="terminal-member"
            >
              <span className="member-avatar">
                {initialOf(member.nickname)}
                <i />
              </span>
              <span className="member-copy">
                <strong>{member.nickname}</strong>
                <small>{owner ? '房主' : '在线'}</small>
              </span>
              {owner && (
                <span className="member-role">房主</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
