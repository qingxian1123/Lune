import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function initialOf(nickname) {
    return nickname.trim().slice(0, 1).toUpperCase() || 'L';
}
export default function MemberList({ members, ownerId }) {
    return (_jsxs("section", { className: "terminal-pane", children: [_jsxs("div", { className: "pane-heading", children: [_jsxs("div", { children: [_jsx("span", { children: "\u6B64\u523B\u5728\u623F\u95F4" }), _jsx("strong", { children: "\u4E00\u8D77\u542C\u7684\u4EBA" })] }), _jsxs("small", { children: [members.length, " \u4EBA\u5728\u7EBF"] })] }), _jsx("ul", { className: "member-terminal-list", children: members.map((member) => {
                    const owner = member.id === ownerId || member.isOwner;
                    return (_jsxs("li", { className: "terminal-member", children: [_jsxs("span", { className: "member-avatar", children: [initialOf(member.nickname), _jsx("i", {})] }), _jsxs("span", { className: "member-copy", children: [_jsx("strong", { children: member.nickname }), _jsx("small", { children: owner ? '房主' : '同步收听中' })] }), owner && (_jsx("span", { className: "member-role", children: "\u623F\u4E3B" }))] }, member.id));
                }) })] }));
}
