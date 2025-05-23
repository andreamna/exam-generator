// Grade button & file logic (unchanged)
const templateInput = document.getElementById('templateInput');
const studentInput  = document.getElementById('studentInput');
const gradeBtn      = document.getElementById('gradeBtn');
const resultArea    = document.getElementById('result');

gradeBtn.addEventListener('click', async () => {
  if (!templateInput.files[0] || !studentInput.files[0]) {
    return alert('Please upload both files.');
  }
  resultArea.textContent = 'Grading in progress…';
  // fetch('/api/grade', …) etc.
});

// Mobile menu toggle
const hamburgerBtn = document.getElementById('hamburgerBtn');
const mobileMenu   = document.getElementById('mobileMenu');

hamburgerBtn.addEventListener('click', () => {
  const isVisible = mobileMenu.style.display === 'flex';
  mobileMenu.style.display = isVisible ? 'none' : 'flex';
});
