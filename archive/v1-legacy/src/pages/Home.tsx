import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 生成 6 位房间码
  const generateCode = () => String(Math.floor(100000 + Math.random() * 900000));

  const createRoom = () => {
    if (!nickname.trim()) {
      setErrorMsg('请输入昵称');
      return;
    }
    const code = generateCode();
    navigate(`/room/${code}`, {
      state: { nickname: nickname.trim(), action: 'create', roomCode: code },
    });
  };

  const joinRoom = () => {
    if (!nickname.trim()) {
      setErrorMsg('请输入昵称');
      return;
    }
    if (!roomCode.trim()) {
      setErrorMsg('请输入房间码');
      return;
    }
    navigate(`/room/${roomCode.trim()}`, {
      state: { nickname: nickname.trim(), action: 'join' },
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-3xl font-bold text-center tracking-widest">LUNE</h1>
        <p className="text-center text-gray-400 text-sm">一起听电台</p>

        <div className="space-y-4">
          <input
            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gray-600"
            placeholder="你的昵称"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
          />

          <input
            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gray-600"
            placeholder="房间码（加入时填写）"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
          />

          {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}

          <div className="flex gap-3">
            <button
              onClick={createRoom}
              className="flex-1 py-3 bg-white text-black font-medium rounded-lg text-sm hover:bg-gray-200"
            >
              创建房间
            </button>
            <button
              onClick={joinRoom}
              className="flex-1 py-3 bg-gray-800 text-white font-medium rounded-lg text-sm hover:bg-gray-700"
            >
              加入房间
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
