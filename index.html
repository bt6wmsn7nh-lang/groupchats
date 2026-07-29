const $ = (s) => document.querySelector(s);
const authView = $('#authView'), appView = $('#appView'), authForm = $('#authForm');
let authMode = 'login', currentUser = null, groups = [], activeGroup = null, socket = null;

function api(url, options = {}) {
  return fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  });
}
function escapeHTML(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function setAuthMode(mode){authMode=mode;$('#loginTab').classList.toggle('active',mode==='login');$('#signupTab').classList.toggle('active',mode==='signup');$('#authTitle').textContent=mode==='login'?'Welcome back':'Create your account';$('#authSub').textContent=mode==='login'?'Log in to continue chatting.':'Choose a username and secure password.';$('#authButton').textContent=mode==='login'?'Log in':'Create account';$('#password').autocomplete=mode==='login'?'current-password':'new-password';$('#authError').textContent='';}
$('#loginTab').onclick=()=>setAuthMode('login');$('#signupTab').onclick=()=>setAuthMode('signup');

authForm.onsubmit=async e=>{e.preventDefault();$('#authError').textContent='';try{const data=await api(`/api/${authMode}`,{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});startApp(data.user)}catch(err){$('#authError').textContent=err.message}};

async function startApp(user){currentUser=user;authView.classList.add('hidden');appView.classList.remove('hidden');$('#currentUser').textContent=user.username;$('#avatar').textContent=user.username[0].toUpperCase();socket=io();socket.on('new-message',({groupId,message})=>{if(activeGroup?.id===groupId){appendMessage(message);scrollBottom()}loadGroups()});await loadGroups();}

async function loadGroups(){const data=await api('/api/groups');groups=data.groups;renderGroups();if(activeGroup){const fresh=groups.find(g=>g.id===activeGroup.id);if(fresh)activeGroup={...activeGroup,...fresh}}}
function renderGroups(){const list=$('#groupList');list.innerHTML=groups.length?'':'<p style="color:#7f899f;font-size:13px;padding:8px">No groups yet.</p>';groups.forEach(g=>{const el=document.createElement('div');el.className='group-item'+(activeGroup?.id===g.id?' active':'');el.innerHTML=`<div class="group-icon">${escapeHTML(g.name[0].toUpperCase())}</div><div class="group-meta"><strong>${escapeHTML(g.name)}</strong><span>${escapeHTML(g.last_message||`${g.member_count} member${g.member_count===1?'':'s'}`)}</span></div>`;el.onclick=()=>openGroup(g.id);list.appendChild(el)})}
async function openGroup(id){const data=await api(`/api/groups/${id}/messages`);activeGroup=data.group;$('#emptyState').classList.add('hidden');$('#chatView').classList.remove('hidden');$('#groupName').textContent=activeGroup.name;$('#copyCode').textContent=activeGroup.code;$('#messages').innerHTML='';data.messages.forEach(appendMessage);socket.emit('join-group',id);renderGroups();scrollBottom();$('.sidebar').classList.remove('open')}
function appendMessage(m){const mine=m.user_id===currentUser.id;const el=document.createElement('div');el.className='message'+(mine?' mine':'');const time=new Date(m.created_at.replace(' ','T')+'Z').toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});el.innerHTML=`<div class="msg-avatar">${escapeHTML(m.username[0].toUpperCase())}</div><div class="bubble"><div class="msg-top"><strong>${escapeHTML(m.username)}</strong><span>${time}</span></div><p>${escapeHTML(m.body)}</p></div>`;$('#messages').appendChild(el)}
function scrollBottom(){const m=$('#messages');m.scrollTop=m.scrollHeight}

$('#messageForm').onsubmit=e=>{e.preventDefault();const input=$('#messageInput'),body=input.value.trim();if(!body||!activeGroup)return;socket.emit('send-message',{groupId:activeGroup.id,body},res=>{if(res?.error)toast(res.error)});input.value='';input.style.height='auto'};
$('#messageInput').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,140)+'px'});$('#messageInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#messageForm').requestSubmit()}});

let modalMode='create';function showModal(mode){modalMode=mode;$('#modal').classList.remove('hidden');$('#modalError').textContent='';$('#modalInput').value='';$('#modalTitle').textContent=mode==='create'?'Create a group':'Join a group';$('#modalText').textContent=mode==='create'?'Give your group a name. A private invite code will be generated automatically.':'Enter the 8-character invite code shared by a group member.';$('#modalInput').placeholder=mode==='create'?'Group name':'ABCD2345';$('#modalSubmit').textContent=mode==='create'?'Create group':'Join group';setTimeout(()=>$('#modalInput').focus(),50)}
$('#createBtn').onclick=()=>showModal('create');$('#joinBtn').onclick=()=>showModal('join');$('#closeModal').onclick=()=>$('#modal').classList.add('hidden');$('#modal').onclick=e=>{if(e.target.id==='modal')$('#modal').classList.add('hidden')};
$('#modalForm').onsubmit=async e=>{e.preventDefault();try{const value=$('#modalInput').value;const data=modalMode==='create'?await api('/api/groups',{method:'POST',body:JSON.stringify({name:value})}):await api('/api/groups/join',{method:'POST',body:JSON.stringify({code:value})});$('#modal').classList.add('hidden');await loadGroups();await openGroup(data.group.id);toast(modalMode==='create'?`Group created — code ${data.group.code}`:'Joined group!')}catch(err){$('#modalError').textContent=err.message}};
$('#copyCode').onclick=async()=>{await navigator.clipboard.writeText(activeGroup.code);toast('Invite code copied')};$('#refreshBtn').onclick=loadGroups;$('#mobileGroups').onclick=()=>$('.sidebar').classList.toggle('open');
$('#logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'});location.reload()};

api('/api/me').then(d=>{if(d.user)startApp(d.user)});
