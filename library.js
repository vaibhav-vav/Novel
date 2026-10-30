import { getUser } from 'https://esm.sh/@netlify/identity@2.0.0?bundle';
const $ = id => document.getElementById(id);
let library = { books: [], chapters: [] };
let readingRequest = 0;
function element(tag, text, className) {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
}
function show(id) {
  document.querySelectorAll('.modal-overlay.open').forEach(node => closeModal(node.id));
  openModal(id);
}
async function request(query = '', options = {}) {
  const response = await fetch('/api/library' + query, { credentials: 'same-origin', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load the library.');
  return data;
}
function render() {
  const list = $('libraryList'); list.replaceChildren();
  if (!library.books.length) list.append(element('p', 'The first book is on its way. Come back soon for new stories.', 'community-copy'));
  for (const book of library.books) {
    const section = element('section', '', 'library-book');
    const header = element('div', '', 'library-book-header');
    const cover = document.createElement('img'); cover.src = '/api/library?cover=' + book.id; cover.alt = book.title + ' cover'; cover.loading = 'lazy';
    header.append(cover, element('h3', book.title)); section.append(header);
    const chapters = library.chapters.filter(chapter => chapter.bookId === book.id);
    if (!chapters.length) section.append(element('p', 'Chapters coming soon.', 'community-copy'));
    for (const chapter of chapters) {
      const button = element('button', chapter.title, 'library-chapter');
      button.onclick = () => read(chapter.id); section.append(button);
    }
    list.append(section);
  }
  const select = $('chapterBookSelect');
  const selection = select.value;
  select.replaceChildren();
  const option = element('option', library.books.length ? 'Choose a book' : 'Create a book first'); option.value = ''; select.append(option);
  for (const book of library.books) {
    const option = element('option', book.title); option.value = book.id; select.append(option);
  }
  select.value = selection;
}
async function refresh() {
  $('libraryStatus').textContent = ''; $('retryLibrary').hidden = true;
  try { library = await request(); render(); }
  catch (error) { $('libraryList').replaceChildren(); $('libraryStatus').textContent = error.message; $('retryLibrary').hidden = false; throw error; }
}
async function openLibrary() {
  show('libraryModal');
  $('libraryList').textContent = 'Loading the library…';
  try { await refresh(); } catch {}
}
async function read(id) {
  const sequence = ++readingRequest;
  show('chapterModal');
  $('chapterHeading').textContent = 'Loading chapter…'; $('chapterBook').textContent = '';
  $('chapterText').textContent = ''; $('chapterStatus').textContent = '';
  $('previousChapter').hidden = $('nextChapter').hidden = true;
  try {
    const { chapter } = await request('?chapter=' + id);
    if (sequence !== readingRequest) return;
    $('chapterHeading').textContent = chapter.title;
    $('chapterBook').textContent = library.books.find(book => book.id === chapter.bookId)?.title || '';
    $('chapterText').textContent = chapter.body;
    const siblings = library.chapters.filter(item => item.bookId === chapter.bookId);
    const index = siblings.findIndex(item => item.id === id);
    $('previousChapter').hidden = index <= 0; $('nextChapter').hidden = index < 0 || index === siblings.length - 1;
    $('previousChapter').onclick = () => read(siblings[index - 1].id);
    $('nextChapter').onclick = () => read(siblings[index + 1].id);
    document.querySelector('.chapter-reader').scrollTop = 0;
  } catch (error) { if (sequence === readingRequest) { $('chapterHeading').textContent = 'Chapter unavailable'; $('chapterStatus').textContent = error.message; } }
}
$('libraryButton').onclick = openLibrary;
$('backLibrary').onclick = openLibrary;
$('retryLibrary').onclick = openLibrary;
async function submit(event, statusId, work) {
  event.preventDefault();
  const button = event.submitter; button.disabled = true; $(statusId).textContent = 'Publishing…';
  try { await getUser(); await work(); }
  catch (error) { $(statusId).textContent = error.message; }
  finally { button.disabled = false; }
}
$('bookForm').onsubmit = event => submit(event, 'bookStatus', async () => {
  const cover = $('bookCover').files[0];
  if (!cover || cover.size > 3000000) throw new Error('Choose a cover image under 3 MB.');
  const form = new FormData(); form.set('title', $('bookTitle').value); form.set('cover', cover);
  const { book } = await request('', { method: 'POST', body: form });
  window.dispatchEvent(new Event('library-published'));
  $('bookForm').reset();
  await refresh(); $('chapterBookSelect').value = String(book.id);
  $('bookStatus').textContent = 'Book created. Add its first chapter below.';
});
$('chapterForm').onsubmit = event => submit(event, 'chapterPublishStatus', async () => {
  const bookId = Number($('chapterBookSelect').value);
  await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId, title: $('chapterTitle').value, body: $('chapterBody').value }) });
  window.dispatchEvent(new Event('library-published'));
  $('chapterTitle').value = ''; $('chapterBody').value = '';
  await refresh(); $('chapterBookSelect').value = String(bookId);
  $('chapterPublishStatus').textContent = 'Published. Your chapter is now available in the library.';
});
new MutationObserver(() => {
  if ($('dashboardModal').classList.contains('open')) refresh().catch(error => { $('bookStatus').textContent = error.message; });
}).observe($('dashboardModal'), { attributes: true, attributeFilter: ['class'] });
// Private entry point for the author. Authorization is enforced by the API.
document.addEventListener('keydown', event => {
  if (event.altKey && event.shiftKey && event.code === 'KeyA') { event.preventDefault(); $('dashboardButton').click(); }
});

function authorEntry() { if (location.hash === '#author-login') $('dashboardButton').click(); }
window.addEventListener('hashchange', authorEntry);
authorEntry();
