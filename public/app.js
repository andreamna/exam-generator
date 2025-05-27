// VIEW SWITCHING
function showView(id) {
  document.querySelectorAll('.view')
    .forEach(sec => sec.classList.toggle('hidden', sec.id !== id));
}
document.querySelectorAll('[data-view]').forEach(btn =>
  btn.addEventListener('click', () => showView(btn.dataset.view))
);
// INITIAL
showView('home');


// DROP-ZONE UTILITY
function setupDropZone(z, i, l) {
  const zone = document.getElementById(z),
        inp  = document.getElementById(i),
        lst  = document.getElementById(l);
  function refresh() {
    lst.innerHTML = '';
    Array.from(inp.files).forEach(f => {
      const li = document.createElement('li');
      li.textContent = f.name;
      lst.appendChild(li);
    });
  }
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    inp.files = e.dataTransfer.files;
    refresh();
  });
  inp.addEventListener('change', refresh);
}
setupDropZone('materialsDrop','materialsInput','materialsList');
setupDropZone('templateDrop','templateInput','templateList');
setupDropZone('answerKeyDrop','answerKeyInput','answerKeyList');
setupDropZone('studentDrop','studentInput','studentList');


// GENERATE → PREVIEW
document.getElementById('genExamBtn').onclick = () => {
  const counts = {
    truefalse: +document.getElementById('count-truefalse').value,
    multiple:  +document.getElementById('count-multiple').value,
    short:     +document.getElementById('count-short').value,
    numeric:   +document.getElementById('count-numeric').value,
  };
  const total = Object.values(counts).reduce((a,b)=>a+b, 0);
  const cont  = document.getElementById('questionsContainer');
  cont.innerHTML = '';
  for(let i=1; i<=total; i++){
    const d = document.createElement('div');
    d.className = 'question-line';
    d.draggable = true;
    d.innerHTML = `
      <span>${i}.</span>
      <span class="blank-line"></span>
      <button class="remove-btn">Remove</button>
    `;
    cont.appendChild(d);
  }
  showView('preview');
};


// REORDER & REMOVE
const cont = document.getElementById('questionsContainer');
let dragSrc = null;
cont.addEventListener('dragstart', e => {
  if (!e.target.classList.contains('question-line')) return;
  dragSrc = e.target; e.target.classList.add('dragging');
});
cont.addEventListener('dragend', e => e.target.classList.remove('dragging'));
cont.addEventListener('dragover', e => {
  e.preventDefault();
  const tgt = e.target.closest('.question-line');
  if (tgt && tgt !== dragSrc) {
    const { top, height } = tgt.getBoundingClientRect();
    const mid = top + height/2;
    cont.insertBefore(dragSrc, e.clientY < mid ? tgt : tgt.nextSibling);
    renumber();
  }
});
cont.addEventListener('click', e => {
  if (e.target.classList.contains('remove-btn')) {
    e.target.closest('.question-line').remove();
    renumber();
  }
  resultArea.textContent = 'Grading in progress…';
  uploadFiles();
});
function renumber(){
  Array.from(cont.children).forEach((ln,i) => {
    ln.querySelector('span').textContent = `${i+1}.`;
  });
}


// INSERT DIRECTLY & AI STUB
document.getElementById('insertDirect').onclick = () => {
  const q = document.getElementById('newQuestion').value.trim();
  if (!q) return alert('Enter a question.');
  const idx = cont.children.length + 1;
  const d = document.createElement('div');
  d.className = 'question-line';
  d.draggable = true;
  d.innerHTML = `<span>${idx}.</span><span>${q}</span><button class="remove-btn">Remove</button>`;
  cont.appendChild(d);
  document.getElementById('newQuestion').value = '';
  renumber();
};
document.getElementById('insertAI').onclick =
  () => document.getElementById('insertDirect').click();

hamburgerBtn.addEventListener('click', () => {
  const isVisible = mobileMenu.style.display === 'flex';
  mobileMenu.style.display = isVisible ? 'none' : 'flex';
});

//Function to upload files to the backend server
function uploadFiles(){
  const input = document.getElementById("studentInput");
  const files = input.files;

  const formData = new FormData();
  for(let i = 0; i<files.length; i++){
    formData.append('documents', files[i]);
  }

  fetch('/uploads', {
    method: 'POST',
    body: formData
  })
  .then(res => {
    if (!res.ok) throw new Error("Upload failed");
  })
  .catch(err => {
    console.error("Upload error:", err.message);
  })
}
// Download Exam as PDF
document.getElementById('downloadExam').onclick = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  cont.querySelectorAll('.question-line').forEach((ln,i) => {
    const t = ln.querySelector('span:nth-child(2)').textContent || '';
    doc.text(`${i+1}. ${t}`, 10, 10 + i*10);
  });
  doc.save('exam_template.pdf');
};


// STUB ANSWER KEY
document.getElementById('downloadKey').onclick =
  () => alert('Answer key download not implemented');


// HAMBURGER MENU
const ham = document.getElementById('hamburgerBtn'),
      side = document.getElementById('sideMenu');
ham.addEventListener('click', () => side.classList.toggle('open'));
side.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', () => side.classList.remove('open'))
);


// AUTH & MENU STATE
async function updateMenu(user){
  document.getElementById('menuUser').textContent = user ? user.name : 'Guest';
  document.getElementById('menuLogin').classList.toggle('hidden', !!user);
  document.getElementById('menuSignup').classList.toggle('hidden', !!user);
  document.getElementById('menuLogout').classList.toggle('hidden', !user);
  document.getElementById('logoutLink').classList.toggle('hidden', !user);
}
async function checkAuth(){
  const res = await fetch('/auth-status'),
        { user } = await res.json();
  updateMenu(user);
}
window.addEventListener('load', checkAuth);


// LOGIN & SIGNUP
document.getElementById('menuLogin').onclick = e => { e.preventDefault(); showView('login'); };
document.getElementById('toSignup').onclick  = e => { e.preventDefault(); showView('signup'); };
document.getElementById('menuSignup').onclick= e => { e.preventDefault(); showView('signup'); };

document.getElementById('loginBtn').onclick = async () => {
  const id  = document.getElementById('loginId').value.trim(),
        pw  = document.getElementById('loginPassword').value;
  const res = await fetch('/login', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ id, password: pw })
  });
  if (res.ok) {
    await checkAuth();
    showView('home');
  } else {
    const { error } = await res.json();
    alert('Login failed: ' + error);
  }
};

document.getElementById('signupBtn').onclick = async () => {
  const id      = document.getElementById('signupId').value.trim(),
        name    = document.getElementById('signupName').value.trim(),
        email   = document.getElementById('signupEmail').value.trim(),
        password= document.getElementById('signupPassword').value,
        confirm = document.getElementById('signupConfirm').value;
  const res = await fetch('/signup', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ id, name, email, password, confirm })
  });
  const data = await res.json();
  if (res.ok) {
    alert('Account created! Please log in.');
    showView('login');
  } else {
    alert('Sign up error: ' + data.error);
  }
};


// LOGOUT
document.getElementById('logoutLink').onclick = async () => {
  await fetch('/logout');
  await checkAuth();
  showView('home');
};
document.getElementById('menuLogout').onclick = async () => {
  await fetch('/logout');
  await checkAuth();
  showView('home');
};


// LECTURE LIBRARY
async function loadLectures() {
  const res = await fetch('/lectures');
  if (!res.ok) return alert('Failed to load lectures');
  const lectures = await res.json();
  const ul = document.getElementById('lecturesList');
  ul.innerHTML = lectures.map(l =>
    `<li>
      ${l.uploadDate.slice(0,10)} — ${l.filename}
      <a href="/${l.path}" download>Download</a>
      <button data-id="${l.id}" class="del-lecture">Delete</button>
    </li>`
  ).join('');
  // attach delete buttons
  document.querySelectorAll('.del-lecture').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.dataset.id;
      await fetch(`/lectures/${id}`, { method:'DELETE' });
      loadLectures();
    };
  });
}

// GRADEBOOK
async function loadGradebook() {
  const res = await fetch('/scores');
  if (!res.ok) return alert('Please log in first');
  const grades = await res.json();
  const tbody = document.querySelector('#gradebookTable tbody');
  tbody.innerHTML = grades.map(g =>
    `<tr>
      <td>${g.date.split('T')[0]}</td>
      <td>${g.examName||'Exam'}</td>
      <td>${g.studentId}</td>
      <td>${g.studentName}</td>
      <td>${g.score}</td>
    </tr>`
  ).join('');
}

// MENU LINK HOOKS
document.querySelectorAll('.menu-link').forEach(btn =>
  btn.addEventListener('click', () => {
    const v = btn.dataset.view;
    showView(v);
    if (v === 'lectures') loadLectures();
    if (v === 'previous') loadGradebook();
  })
);


// BATCH GRADING (AI)
document.getElementById('gradeBatchBtn').onclick = async () => {
  const tpl = document.getElementById('templateInput').files[0];
  const key = document.getElementById('answerKeyInput').files[0];
  const subs = Array.from(document.getElementById('studentInput').files);
  if (!tpl || !key || !subs.length) {
    return alert('Please upload template, answer key and student papers.');
  }
  const form = new FormData();
  form.append('template', tpl);
  form.append('answerKey', key);
  subs.forEach(f => form.append('studentPapers', f));

  const res = await fetch('/grade-batch', { method:'POST', body: form });
  if (!res.ok) {
    const err = await res.json();
    return alert('Batch grading error: ' + err.error);
  }
  const results = await res.json();
  const tbody = document.querySelector('#batchResults tbody');
  tbody.innerHTML = results.map(r =>
    `<tr>
      <td>${r.studentId}</td>
      <td>${r.studentName}</td>
      <td>${r.score}</td>
      <td><a href="${r.paperUrl}" download>Download</a></td>
    </tr>`
  ).join('');

  // **NEW**: reveal the results section now that we have data
  document.getElementById('resultsSection').classList.remove('hidden');
};

