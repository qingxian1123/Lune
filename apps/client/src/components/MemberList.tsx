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
              {owner && <span className="workspace-member-role">房主</span>}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="terminal-pane">
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
