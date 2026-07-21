import type { Member } from '@lune/shared';

interface MemberListProps {
  members: Member[];
  ownerId: string;
}

function initialOf(nickname: string) {
  return nickname.trim().slice(0, 1).toUpperCase() || 'L';
}

export default function MemberList({ members, ownerId }: MemberListProps) {
  return (
    <section className="terminal-pane">
      <div className="pane-heading">
        <div><span>此刻在房间</span><strong>一起听的人</strong></div>
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
                <small>{owner ? '房主' : '同步收听中'}</small>
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
