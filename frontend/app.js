// View switcher
document.querySelectorAll('[data-view]').forEach(btn =>
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('.view')
      .forEach(sec => sec.classList.toggle('hidden', sec.id !== view));
  })
);

// Utility: setup one drop-zone & list
function setupDropZone(zoneId, inputId, listId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const list  = document.getElementById(listId);

  // show file list
  function refreshList() {
    list.innerHTML = '';
    Array.from(input.files).forEach(f => {
      const li = document.createElement('li');
      li.textContent = f.name;
      list.appendChild(li);
    });
  }

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    input.files = e.dataTransfer.files;
    refreshList();
  });
  input.addEventListener('change', refreshList);
}

// Set up three file areas
setupDropZone('materialsDrop','materialsInput','materialsList');
setupDropZone('templateDrop', 'templateInput','templateList');
setupDropZone('studentDrop','studentInput','studentList');

// Generate Exam → Preview
document.getElementById('genExamBtn').onclick = function() {
  const counts = {
    truefalse: +document.getElementById('count-truefalse').value,
    multiple:  +document.getElementById('count-multiple').value,
    short:     +document.getElementById('count-short').value,
    numeric:   +document.getElementById('count-numeric').value,
  };
  const total = Object.values(counts).reduce((a,b) => a + b, 0);

  // populate questions
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';
  for (let i=1; i<=total; i++) {
    const div = document.createElement('div');
    div.className = 'question-line';
    div.draggable = true;
    div.innerHTML = `
      <span>${i}.</span>
      <span class="blank-line"></span>
      <button class="remove-btn">Remove</button>
    `;
    container.appendChild(div);
  }

  // switch view
  this.dispatchEvent(new Event('click'));
};

// Reorder & remove in Preview
const container = document.getElementById('questionsContainer');
let dragSrc = null;
container.addEventListener('dragstart', e => {
  if (!e.target.classList.contains('question-line')) return;
  dragSrc = e.target;
  e.target.classList.add('dragging');
});
container.addEventListener('dragend', e => {
  e.target.classList.remove('dragging');
});
container.addEventListener('dragover', e => {
  e.preventDefault();
  const target = e.target.closest('.question-line');
  if (target && target !== dragSrc) {
    const rect = target.getBoundingClientRect();
    const mid = rect.top + rect.height/2;
    if (e.clientY < mid) {
      container.insertBefore(dragSrc, target);
    } else {
      container.insertBefore(dragSrc, target.nextSibling);
    }
  }
  renumber();
});
container.addEventListener('click', e => {
  if (e.target.classList.contains('remove-btn')) {
    e.target.closest('.question-line').remove();
    renumber();
  }
});

// Insert Directly & AI stub
document.getElementById('insertDirect').onclick = () => {
  const q = document.getElementById('newQuestion').value.trim();
  if (!q) return alert('Enter a question.');
  const idx = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'question-line';
  div.draggable = true;
  div.innerHTML = `<span>${idx}.</span><span>${q}</span><button class="remove-btn">Remove</button>`;
  container.appendChild(div);
  document.getElementById('newQuestion').value = '';
  renumber();
};
document.getElementById('insertAI').onclick =
  () => document.getElementById('insertDirect').click();

// Download Exam as PDF
document.getElementById('downloadExam').onclick = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  container.querySelectorAll('.question-line').forEach((ln,i) => {
    const text = ln.querySelector('span:nth-child(2)').textContent || '';
    doc.text(`${i+1}. ${text}`, 10, 10 + i*10);
  });
  doc.save('exam_template.pdf');
};

// Answer Key stub
document.getElementById('downloadKey').onclick = () => {
  alert('Answer key download not implemented');
};

// Grade stub
document.getElementById('gradeBtn').onclick = () => {
  const tpl = document.getElementById('templateInput').files[0];
  const stu = document.getElementById('studentInput').files[0];
  if (!tpl || !stu) return alert('Upload both files');
  document.getElementById('result').textContent = 'Grading…';
};

// Helper: renumber
function renumber() {
  Array.from(container.children).forEach((ln,i) => {
    ln.querySelector('span').textContent = (i+1)+'.';
  });
}
