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
  uploadFiles();
});

// Mobile menu toggle
const hamburgerBtn = document.getElementById('hamburgerBtn');
const mobileMenu   = document.getElementById('mobileMenu');

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