/**
 * Main Application Entry Point
 */

import { loadConfig, fetchAllProjectsData } from './api.js';
import {
    defaultFilters,
    applyFilters,
    sortProjects,
    calculateGlobalStats,
    getVisibleProjects,
    buildContributorLeaderboard,
    calculateDailyCounts
} from './filters.js';
import {
    initUI,
    renderStats,
    renderLeaderboard,
    renderContributorsLeaderboard,
    renderFiltersBar,
    renderHeatmaps,
    showDayActivity,
    showLoading,
    hideLoading,
    showEmpty
} from './ui.js';
import { initModal, openModal } from './modal.js';

// Application State
const state = {
    config: null,
    projects: [],
    contributors: [],
    filters: { ...defaultFilters },
    expandedProjects: new Set(),
    activeTab: 'repos',
    isLoading: false
};

// Initialize application
async function init() {
    initUI();
    initModal();
    setupEventListeners();
    setupTabs();

    try {
        showLoading();
        state.config = await loadConfig();

        // Apply default sort from config
        if (state.config.settings.defaultSort) {
            state.filters.sortBy = state.config.settings.defaultSort;
        }
        if (state.config.settings.defaultSortOrder) {
            state.filters.sortOrder = state.config.settings.defaultSortOrder;
        }

        await fetchData();
        renderFiltersBar(state.filters, handleFilterChange);
        render();
    } catch (error) {
        console.error('Failed to initialize:', error);
        hideLoading();
        showEmpty(true);
    }
}

async function fetchData() {
    state.isLoading = true;
    showLoading();

    try {
        state.projects = await fetchAllProjectsData(
            state.config.projects,
            state.config.settings
        );

        // Build contributor leaderboard
        state.contributors = buildContributorLeaderboard(
            state.projects,
            state.config.settings.thresholdDate,
            state.filters.contribSort
        );
    } catch (error) {
        console.error('Failed to fetch data:', error);
    } finally {
        state.isLoading = false;
        hideLoading();
    }
}

function render() {
    const stats = calculateGlobalStats(state.projects, state.config.settings.thresholdDate);
    renderStats(stats);

    // Render heatmaps
    const heatmapData = calculateDailyCounts(
        state.projects,
        '2026-01-30', // Forced range as requested
        '2026-03-30'
    );
    renderHeatmaps(heatmapData, handleDayClick);

    if (state.activeTab === 'repos') {
        // Render repos leaderboard
        const filteredProjects = applyFilters(state.projects, state.filters);
        const sortedProjects = sortProjects(filteredProjects, state.filters.sortBy, state.filters.sortOrder);
        const visibleProjects = getVisibleProjects(sortedProjects);

        renderLeaderboard(
            visibleProjects,
            state.expandedProjects,
            handleProjectToggle,
            handleIssueClick
        );
    } else {
        // Render contributors leaderboard
        const contributors = buildContributorLeaderboard(
            state.projects,
            state.config.settings.thresholdDate,
            state.filters.contribSort
        );

        renderContributorsLeaderboard(contributors, handleIssueClick);
    }
}

function handleFilterChange(filterType, value) {
    state.filters[filterType] = value;
    renderFiltersBar(state.filters, handleFilterChange);
    render();
}

function handleProjectToggle(projectId) {
    if (state.expandedProjects.has(projectId)) {
        state.expandedProjects.delete(projectId);
    } else {
        state.expandedProjects.add(projectId);
    }
    render();
}

function handleIssueClick(issue, owner, repo) {
    openModal(issue, owner, repo);
}

function handleDayClick(date, type) {
    const items = [];
    state.projects.forEach(project => {
        // Search issues for assigned/closed
        if (type === 'assigned' || type === 'closed') {
            project.issues.forEach(issue => {
                if (type === 'assigned') {
                    if (issue.created_at) {
                        const issueDate = new Date(issue.created_at).toISOString().split('T')[0];
                        if (issueDate === date) {
                            items.push({ issue, owner: project.owner, repo: project.repo });
                        }
                    }
                } else if (type === 'closed') {
                    if (issue.state === 'closed' && issue.closed_at) {
                        const issueDate = new Date(issue.closed_at).toISOString().split('T')[0];
                        if (issueDate === date) {
                            items.push({ issue, owner: project.owner, repo: project.repo });
                        }
                    }
                }
            });
        }

        // Search PRs for merged/open
        if (type === 'merged_prs' || type === 'open_prs') {
            if (project.prs) {
                project.prs.forEach(pr => {
                    if (type === 'merged_prs') {
                        if (pr.state === 'closed' && pr.closed_at) {
                            const prDate = new Date(pr.closed_at).toISOString().split('T')[0];
                            if (prDate === date) {
                                items.push({ issue: pr, owner: project.owner, repo: project.repo });
                            }
                        }
                    } else if (type === 'open_prs') {
                        if (pr.state === 'open') {
                            const prDate = new Date(pr.created_at).toISOString().split('T')[0];
                            if (prDate === date) {
                                items.push({ issue: pr, owner: project.owner, repo: project.repo });
                            }
                        }
                    }
                });
            }
        }
    });

    showDayActivity(date, type, items, handleIssueClick);
}

function setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await fetchData();
            render();
        });
    }

    // Theme toggle
    const themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            // Reinitialize icons after theme change
            if (window.lucide) window.lucide.createIcons();
        });
    }

    // Settings modal
    setupSettingsModal();
}

function setupSettingsModal() {
    const settingsBtn = document.getElementById('btn-settings');
    const settingsBackdrop = document.getElementById('settings-backdrop');
    const settingsModal = document.getElementById('settings-modal');
    const settingsClose = document.getElementById('settings-close');
    const tokenInput = document.getElementById('github-token-input');
    const tokenStatus = document.getElementById('token-status');
    const saveBtn = document.getElementById('btn-save-token');
    const clearBtn = document.getElementById('btn-clear-token');

    function openSettingsModal() {
        // Load current token (masked)
        const currentToken = localStorage.getItem('github_token') || '';
        tokenInput.value = currentToken;
        updateTokenStatus();

        settingsBackdrop?.classList.add('active');
        settingsModal?.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (window.lucide) window.lucide.createIcons();
    }

    function closeSettingsModal() {
        settingsBackdrop?.classList.remove('active');
        settingsModal?.classList.remove('active');
        document.body.style.overflow = '';
    }

    function updateTokenStatus() {
        const hasToken = !!localStorage.getItem('github_token');
        if (tokenStatus) {
            if (hasToken) {
                tokenStatus.innerHTML = `
                    <div class="flex items-center gap-2 text-primary">
                        <i data-lucide="check-circle" class="w-4 h-4"></i>
                        Token محفوظ - 5000 طلب/ساعة
                    </div>
                `;
            } else {
                tokenStatus.innerHTML = `
                    <div class="flex items-center gap-2 text-muted-foreground">
                        <i data-lucide="info" class="w-4 h-4"></i>
                        بدون Token - 60 طلب/ساعة
                    </div>
                `;
            }
            if (window.lucide) window.lucide.createIcons();
        }
    }

    settingsBtn?.addEventListener('click', openSettingsModal);
    settingsBackdrop?.addEventListener('click', closeSettingsModal);
    settingsClose?.addEventListener('click', closeSettingsModal);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsModal?.classList.contains('active')) {
            closeSettingsModal();
        }
    });

    // Save token
    saveBtn?.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        if (token) {
            localStorage.setItem('github_token', token);
        } else {
            localStorage.removeItem('github_token');
        }
        updateTokenStatus();
        closeSettingsModal();

        // Refresh data with new token
        await fetchData();
        render();
    });

    // Clear token
    clearBtn?.addEventListener('click', () => {
        localStorage.removeItem('github_token');
        tokenInput.value = '';
        updateTokenStatus();
    });
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const reposContent = document.getElementById('repos-content');
    const contributorsContent = document.getElementById('contributors-content');
    const filterBar = document.getElementById('filter-bar');
    const contributorsFilterBar = document.getElementById('contributors-filter-bar');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            state.activeTab = tabName;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide content
            if (tabName === 'repos') {
                reposContent?.classList.remove('hidden');
                contributorsContent?.classList.add('hidden');
                filterBar?.classList.remove('hidden');
                contributorsFilterBar?.classList.add('hidden');
            } else {
                reposContent?.classList.add('hidden');
                contributorsContent?.classList.remove('hidden');
                filterBar?.classList.add('hidden');
                contributorsFilterBar?.classList.remove('hidden');
            }

            render();
        });
    });
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
