/**
 * Modal Module
 * Handles issue details modal
 */

import { fetchIssueComments } from './api.js';

let modalBackdrop, modal, modalTitle, modalBody, modalGithubLink, modalClose;
let currentIssue = null;

export function initModal() {
  modalBackdrop = document.getElementById('modal-backdrop');
  modal = document.getElementById('issue-modal');
  modalTitle = document.getElementById('modal-title');
  modalBody = document.getElementById('modal-body');
  modalGithubLink = document.getElementById('modal-github-link');
  modalClose = document.getElementById('modal-close');

  // Close modal on backdrop click
  modalBackdrop?.addEventListener('click', closeModal);
  modalClose?.addEventListener('click', closeModal);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('active')) {
      closeModal();
    }
  });
}

export async function openModal(issue, owner, repo) {
  currentIssue = { issue, owner, repo };

  // Set title and link
  modalTitle.textContent = issue.title;
  modalGithubLink.href = issue.html_url;

  // Render initial content with loading
  renderModalContent(issue, [], true);

  // Show modal
  modalBackdrop?.classList.add('active');
  modal?.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Reinitialize Lucide icons
  if (window.lucide) window.lucide.createIcons();

  // Fetch comments
  try {
    const comments = await fetchIssueComments(owner, repo, issue.number);
    renderModalContent(issue, comments, false);
    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    renderModalContent(issue, [], false);
  }
}

export function closeModal() {
  modalBackdrop?.classList.remove('active');
  modal?.classList.remove('active');
  document.body.style.overflow = '';
  currentIssue = null;
}

export function getCurrentIssue() {
  return currentIssue;
}

function renderModalContent(issue, comments, isLoading) {
  const statusBadge = issue.state === 'open'
    ? '<span class="badge badge-success">مفتوحة</span>'
    : '<span class="badge" style="background: hsl(271 91% 65% / 0.15); color: hsl(271 91% 65%);">مغلقة</span>';

  const pointsBadge = issue.points > 0
    ? `<span class="badge badge-points">${issue.points} نقطة</span>`
    : '';

  const assignee = issue.assignee
    ? `
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <i data-lucide="user" class="w-4 h-4"></i>
        <span>مسندة إلى:</span>
        <div class="avatar">
          <img src="${issue.assignee.avatar_url}" alt="${issue.assignee.login}">
        </div>
        <a href="${issue.assignee.html_url}" target="_blank" class="text-primary hover:underline">${issue.assignee.login}</a>
      </div>
    `
    : '';

  const commentsSection = renderCommentsSection(comments, isLoading);

  modalBody.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 mb-4">
      ${statusBadge}
      ${pointsBadge}
      <span class="badge badge-secondary">#${issue.number}</span>
      ${assignee}
    </div>
    ${commentsSection}
  `;
}

function renderCommentsSection(comments, isLoading) {
  if (isLoading) {
    return `
            <div class="comments-section">
                <div class="comments-header">
                    <i data-lucide="message-circle" class="w-5 h-5"></i>
                    التعليقات
                </div>
                <div class="flex items-center justify-center py-8">
                    <div class="spinner" style="width: 1.5rem; height: 1.5rem;"></div>
                </div>
            </div>
        `;
  }

  if (comments.length === 0) {
    return `
            <div class="comments-section">
                <div class="comments-header">
                    <i data-lucide="message-circle" class="w-5 h-5"></i>
                    التعليقات (0)
                </div>
                <p class="text-muted-foreground text-sm">لا توجد تعليقات على هذه المهمة.</p>
            </div>
        `;
  }

  return `
        <div class="comments-section">
            <div class="comments-header">
                <i data-lucide="message-circle" class="w-5 h-5"></i>
                التعليقات (${comments.length})
            </div>
            ${comments.map(renderComment).join('')}
        </div>
    `;
}

function renderComment(comment) {
  const date = new Date(comment.created_at).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return `
        <div class="comment">
            <div class="comment-avatar">
                <img src="${comment.user.avatar_url}" alt="${comment.user.login}">
            </div>
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-author">${comment.user.login}</span>
                    <span class="comment-date">${date}</span>
                </div>
                <div class="comment-body">${formatMarkdown(comment.body)}</div>
            </div>
        </div>
    `;
}

function formatMarkdown(text) {
  if (!text) return '';

  return text
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```(\w*)\n?/g, '').replace(/```/g, '');
      return `<pre><code>${code}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-primary hover:underline">$1</a>')
    // Lists
    .replace(/^\- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    // Wrap in paragraph
    .replace(/^(.*)$/s, '<p>$1</p>')
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, '')
    .replace(/<p><br><\/p>/g, '');
}
