/**
 * UI Module
 * Handles all DOM rendering
 */

import { openModal } from './modal.js';

// Cache DOM elements
let leaderboardEl, contributorsLeaderboardEl, loadingEl, emptyEl;
let statOpen, statComments, statAssigned, statClosed, statPoints;
let heatmapAssignedEl, heatmapClosedEl, heatmapMergedPrsEl, heatmapOpenPrsEl;
let dayModalEl, dayBackdropEl, dayIssuesListEl, dayModalTitleEl;

// Issue cache to avoid storing large JSON in HTML attributes
const issueCache = new Map();

export function initUI() {
  leaderboardEl = document.getElementById('leaderboard');
  contributorsLeaderboardEl = document.getElementById('contributors-leaderboard');
  loadingEl = document.getElementById('loading-state');
  emptyEl = document.getElementById('empty-state');
  statOpen = document.getElementById('stat-open');
  statComments = document.getElementById('stat-comments');
  statAssigned = document.getElementById('stat-assigned');
  statClosed = document.getElementById('stat-closed');
  statPoints = document.getElementById('stat-points');
  heatmapAssignedEl = document.getElementById('heatmap-assigned');
  heatmapClosedEl = document.getElementById('heatmap-closed');
  heatmapMergedPrsEl = document.getElementById('heatmap-merged-prs');
  heatmapOpenPrsEl = document.getElementById('heatmap-open-prs');
  dayModalEl = document.getElementById('day-modal');
  dayBackdropEl = document.getElementById('day-backdrop');
  dayIssuesListEl = document.getElementById('day-issues-list');
  dayModalTitleEl = document.getElementById('day-modal-title');

  // Close day modal listeners
  document.getElementById('day-modal-close')?.addEventListener('click', closeDayModal);
  dayBackdropEl?.addEventListener('click', closeDayModal);
}

export function renderStats(stats) {
  if (statOpen) statOpen.textContent = stats.open;
  if (statComments) statComments.textContent = stats.withComments;
  if (statAssigned) statAssigned.textContent = stats.withAssignees;
  if (statClosed) statClosed.textContent = stats.closedSince;
  if (statPoints) statPoints.textContent = `${stats.collectedPoints}/${stats.totalPoints}`;
}

export function showLoading() {
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (leaderboardEl) leaderboardEl.innerHTML = '';
  if (contributorsLeaderboardEl) contributorsLeaderboardEl.innerHTML = '';
}

export function hideLoading() {
  if (loadingEl) loadingEl.classList.add('hidden');
}

export function showEmpty(show = true) {
  if (emptyEl) {
    emptyEl.classList.toggle('hidden', !show);
  }
}

export function renderLeaderboard(projects, expandedProjects, onProjectToggle, onIssueClick) {
  if (!leaderboardEl) return;

  if (projects.length === 0) {
    leaderboardEl.innerHTML = '';
    showEmpty(true);
    return;
  }

  showEmpty(false);

  // Clear and populate issue cache
  issueCache.clear();
  projects.forEach(project => {
    const issues = project.filteredIssues || project.issues;
    issues.forEach(issue => {
      const key = `${project.owner}/${project.repo}/${issue.number}`;
      issueCache.set(key, { issue, owner: project.owner, repo: project.repo });
    });
  });

  const html = projects.map((project, index) => {
    const rank = index + 1;
    const isExpanded = expandedProjects.has(project.id);
    return renderProjectCard(project, rank, isExpanded);
  }).join('');

  leaderboardEl.innerHTML = html;

  // Reinitialize Lucide icons for dynamic content
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Attach event listeners
  leaderboardEl.querySelectorAll('.project-header').forEach(header => {
    header.addEventListener('click', () => {
      const projectId = header.dataset.projectId;
      onProjectToggle(projectId);
    });
  });

  leaderboardEl.querySelectorAll('.issue-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const issueKey = card.dataset.issueKey;
      const cached = issueCache.get(issueKey);
      if (cached) {
        onIssueClick(cached.issue, cached.owner, cached.repo);
      }
    });
  });
}

function renderProjectCard(project, rank, isExpanded) {
  const stats = project.filteredStats || project.stats;
  const issues = project.filteredIssues || project.issues;

  return `
    <div class="project-card ${isExpanded ? 'expanded' : ''}">
      <div class="project-header" data-project-id="${project.id}">
        <div class="project-icon">
          <i data-lucide="folder-git-2" class="w-4 h-4"></i>
        </div>
        <div class="project-info">
          <div class="project-name">${project.name}</div>
          <div class="project-stats">
            <span class="project-stat">
              <i data-lucide="circle-dot" class="w-3 h-3" style="color: hsl(var(--primary))"></i>
              ${stats.open}
            </span>
            <span class="project-stat">
              <i data-lucide="user" class="w-3 h-3"></i>
              ${stats.assigned}
            </span>
            <span class="project-stat">
              <i data-lucide="check-circle" class="w-3 h-3" style="color: hsl(271 91% 65%)"></i>
              ${stats.closed}
            </span>
          </div>
        </div>
        ${stats.points > 0 ? `<span class="badge badge-points">${stats.points}</span>` : ''}
        <span class="badge badge-secondary">${stats.total}</span>
        <i data-lucide="chevron-down" class="expand-icon w-4 h-4"></i>
      </div>
      <div class="project-issues">
        <div class="issues-list">
          ${issues.map(issue => renderIssueCard(issue, project.owner, project.repo)).join('')}
        </div>
      </div>
    </div>
  `;
}

export function renderIssueCard(issue, owner, repo) {
  const statusClass = issue.state === 'open' ? 'open' : 'closed';
  const pointsBadge = issue.points > 0
    ? `<span class="badge badge-points">${issue.points}</span>`
    : '';

  const assigneeName = issue.assignee
    ? `<span class="assignee-name truncate max-w-[80px]">${issue.assignee.login}</span>`
    : '';

  const labels = (issue.labels || [])
    .filter(l => !l.name.match(/^\d+/))
    .slice(0, 3)
    .map(l => `<span class="badge badge-secondary" style="background-color: #${l.color}20; color: #${l.color}; border-color: #${l.color}50">${l.name}</span>`)
    .join('');

  const githubLink = `<a href="${issue.html_url}" target="_blank" rel="noopener" class="text-muted-foreground hover:text-primary transition-colors ml-auto mr-2" title="فتح في GitHub">
    <i data-lucide="external-link" class="w-3 h-3"></i>
  </a>`;

  const assignee = issue.assignee
    ? `<div class="avatar"><img src="${issue.assignee.avatar_url}" alt="${issue.assignee.login}"></div>`
    : '';

  const date = new Date(issue.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });

  // Use a simple key instead of full JSON to avoid HTML escaping issues
  const issueKey = `${owner}/${repo}/${issue.number}`;

  return `
    <div class="issue-card" data-issue-key="${issueKey}">
      <div class="issue-status ${statusClass}"></div>
      <div class="issue-content">
        <div class="flex items-center gap-2">
          <div class="issue-title truncate">${issue.title}</div>
          ${githubLink}
        </div>
        <div class="issue-labels">
          ${pointsBadge}
          ${labels}
        </div>
        <div class="issue-meta">
          <div class="flex items-center gap-1">
            ${assignee}
            ${assigneeName}
          </div>
          <span class="issue-meta-item">
            <i data-lucide="message-circle" class="w-3 h-3"></i>
            ${issue.comments}
          </span>
          <span class="issue-meta-item">
            <i data-lucide="calendar" class="w-3 h-3"></i>
            ${date}
          </span>
          <span class="issue-meta-item">#${issue.number}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderContributorsLeaderboard(contributors, onIssueClick) {
  if (!contributorsLeaderboardEl) return;

  if (contributors.length === 0) {
    contributorsLeaderboardEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center">
                <i data-lucide="users" class="w-16 h-16 text-muted-foreground mb-4"></i>
                <h3 class="text-lg font-semibold text-foreground">لا يوجد مساهمون بعد</h3>
                <p class="text-muted-foreground">لم يتم إغلاق أي مهام من قبل المساهمين حتى الآن.</p>
            </div>
        `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const html = contributors.map((contributor, index) => {
    const rank = index + 1;
    return renderContributorCard(contributor, rank);
  }).join('');

  contributorsLeaderboardEl.innerHTML = html;

  // Reinitialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderContributorCard(contributor, rank) {
  const rankClass = rank <= 3 ? `rank-${rank}` : '';

  return `
    <div class="contributor-card">
      <div class="rank-badge ${rankClass}">${rank}</div>
      <div class="contributor-avatar">
        <img src="${contributor.avatar_url}" alt="${contributor.username}">
      </div>
      <div class="contributor-info">
        <div class="contributor-name">
          <a href="${contributor.html_url}" target="_blank" rel="noopener">${contributor.username}</a>
        </div>
        <div class="contributor-stats">
          <span class="contributor-stat">
            <i data-lucide="check-circle" class="w-3 h-3" style="color: hsl(271 91% 65%)"></i>
            ${contributor.closedCount}
          </span>
          <span class="contributor-stat">
            <i data-lucide="user" class="w-3 h-3"></i>
            ${contributor.assignedCount}
          </span>
        </div>
      </div>
      <div class="contributor-points">
        <span class="badge badge-points">${contributor.totalPoints}</span>
      </div>
    </div>
  `;
}

export function renderFiltersBar(filters, onChange) {
  // Status pills
  document.querySelectorAll('[data-filter="status"]').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.value === filters.status);
    pill.onclick = () => onChange('status', pill.dataset.value);
  });

  // Assignment pills
  document.querySelectorAll('[data-filter="assignment"]').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.value === filters.assignment);
    pill.onclick = () => onChange('assignment', pill.dataset.value);
  });

  // Comments pills
  document.querySelectorAll('[data-filter="comments"]').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.value === filters.comments);
    pill.onclick = () => onChange('comments', pill.dataset.value);
  });

  // Contributor sort pills
  document.querySelectorAll('[data-filter="contrib-sort"]').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.value === filters.contribSort);
    pill.onclick = () => onChange('contribSort', pill.dataset.value);
  });

  // Points toggle
  const pointsToggle = document.getElementById('toggle-points');
  if (pointsToggle) {
    pointsToggle.classList.toggle('active', filters.points === 'has-points');
    pointsToggle.parentElement.onclick = () => {
      onChange('points', filters.points === 'has-points' ? 'all' : 'has-points');
    };
  }

  // Sort select
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.value = filters.sortBy;
    sortSelect.onchange = () => onChange('sortBy', sortSelect.value);
  }
}

/**
 * Render heatmaps for assigned and closed issues
 * @param {Object} data { assigned, closed }
 * @param {Function} onDayClick callback(date, type)
 */
export function renderHeatmaps(data, onDayClick) {
  if (!heatmapAssignedEl || !heatmapClosedEl) return;

  const renderGrid = (container, counts, type) => {
    if (!container) return;
    const dates = Object.keys(counts).sort();
    const html = dates.map(date => {
      const count = counts[date];
      let level = 0;
      if (count > 0) level = 1;
      if (count > 3) level = 2;
      if (count > 7) level = 3;
      if (count > 12) level = 4;

      const formattedDate = new Date(date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
      const tooltip = `${formattedDate}: ${count} عنصر`;

      return `<div 
        class="heatmap-cell" 
        data-count="${count}" 
        data-level="${level}" 
        data-tooltip="${tooltip}" 
        data-date="${date}"
        data-type="${type}"
      ></div>`;
    }).join('');

    container.innerHTML = html;

    // Add click listeners
    container.querySelectorAll('.heatmap-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        const date = cell.dataset.date;
        const type = cell.dataset.type;
        onDayClick(date, type);
      });
    });
  };

  renderGrid(heatmapAssignedEl, data.assigned, 'assigned');
  renderGrid(heatmapClosedEl, data.closed, 'closed');
  renderGrid(heatmapMergedPrsEl, data.merged_prs, 'merged_prs');
  renderGrid(heatmapOpenPrsEl, data.open_prs, 'open_prs');
}

export function showDayActivity(date, type, issues, onIssueClick) {
  if (!dayModalEl || !dayIssuesListEl || !dayModalTitleEl) return;

  const formattedDate = new Date(date).toLocaleDateString('ar-EG', { month: 'long', day: 'numeric', year: 'numeric' });

  let typeText = 'نشاط اليوم';
  switch (type) {
    case 'assigned': typeText = 'المهام المسندة'; break;
    case 'closed': typeText = 'المهام المغلقة'; break;
    case 'merged_prs': typeText = 'طلبات السحب المدمجة'; break;
    case 'open_prs': typeText = 'طلبات السحب المفتوحة'; break;
  }

  dayModalTitleEl.textContent = `${typeText} - ${formattedDate}`;

  if (issues.length === 0) {
    dayIssuesListEl.innerHTML = '<p class="text-center py-8 text-muted-foreground">لا توجد عناصر في هذا اليوم.</p>';
  } else {
    dayIssuesListEl.innerHTML = issues.map(item =>
      renderIssueCard(item.issue, item.owner, item.repo)
    ).join('');

    // Attach issue click listeners
    dayIssuesListEl.querySelectorAll('.issue-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // If clicked on an actual link, don't open modal
        if (e.target.closest('a')) return;

        const issueKey = card.dataset.issueKey;
        const cached = issueCache.get(issueKey);
        if (cached) {
          onIssueClick(cached.issue, cached.owner, cached.repo);
        }
      });
    });
  }

  dayBackdropEl.classList.add('active');
  dayModalEl.classList.add('active');
  document.body.style.overflow = 'hidden';

  if (window.lucide) window.lucide.createIcons();
}

export function closeDayModal() {
  dayBackdropEl?.classList.remove('active');
  dayModalEl?.classList.remove('active');
  document.body.style.overflow = '';
}
