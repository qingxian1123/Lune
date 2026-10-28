const scale = document.querySelector('.radio-dial-scale');
for (let mark = 0; mark < 48; mark += 1) {
  const tick = document.createElement('i');
  if (mark % 4 === 0) tick.className = 'is-major';
  tick.style.transform = `rotate(${mark * 7.5}deg)`;
  scale.append(tick);
}

const home = document.querySelector('.radio-home');
const narrowScreen = window.matchMedia('(max-width: 760px)');
function adaptLayout() {
  home.classList.toggle('is-mobile', narrowScreen.matches);
}
adaptLayout();
narrowScreen.addEventListener('change', adaptLayout);

const createAction = document.querySelector('#create-action');
const joinAction = document.querySelector('#join-action');
const entryForm = document.querySelector('#entry-form');
const formSubmit = document.querySelector('#form-submit span');
const nickname = document.querySelector('#nickname');
const roomField = document.querySelector('#room-field');
const roomCode = document.querySelector('#room-code');
const feedback = document.querySelector('#form-feedback');
let mode = 'create';

function setMode(nextMode) {
  mode = nextMode;
  const joining = mode === 'join';
  createAction.classList.toggle('is-active', !joining);
  joinAction.classList.toggle('is-active', joining);
  createAction.setAttribute('aria-pressed', String(!joining));
  joinAction.setAttribute('aria-pressed', String(joining));
  roomField.hidden = !joining;
  entryForm.dataset.mode = mode;
  formSubmit.textContent = joining ? '加入房间' : '创建房间';
  feedback.textContent = '';
  if (joining) roomCode.focus();
}

createAction.addEventListener('click', () => setMode('create'));
joinAction.addEventListener('click', () => setMode('join'));
roomCode.addEventListener('input', () => {
  roomCode.value = roomCode.value.toUpperCase().slice(0, 6);
});

entryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  nickname.removeAttribute('aria-invalid');
  roomCode.removeAttribute('aria-invalid');
  if (!nickname.value.trim()) {
    feedback.textContent = '请先输入你的昵称。';
    nickname.setAttribute('aria-invalid', 'true');
    nickname.focus();
    return;
  }
  if (mode === 'join' && roomCode.value.trim().length !== 6) {
    feedback.textContent = '请输入六位房间码。';
    roomCode.setAttribute('aria-invalid', 'true');
    roomCode.focus();
    return;
  }
  feedback.textContent = '这是一份视觉预览；请返回正式首页进入房间。';
});
