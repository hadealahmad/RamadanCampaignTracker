/**
 * GitHub API Module
 * Handles all API interactions with GitHub
 */

import { config } from './config.js';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Get headers for GitHub API requests
 * If a token is configured, it will be included for authenticated requests
 * @returns {Object} Headers object
 */
function getHeaders() {
    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };

    if (config.GITHUB_TOKEN && config.GITHUB_TOKEN.trim() !== '') {
        headers['Authorization'] = `Bearer ${config.GITHUB_TOKEN}`;
    }

    return headers;
}

/**
 * Load configuration from projects.json
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfig() {
    try {
        const response = await fetch('./projects.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading config:', error);
        throw error;
    }
}

/**
 * Fetch issues for a single repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} perPage - Number of issues per page
 * @returns {Promise<Array>} Array of issues
 */
export async function fetchProjectIssues(owner, repo, perPage = 100) {
    try {
        const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?state=all&per_page=${perPage}`;
        const response = await fetch(url, { headers: getHeaders() });

        if (!response.ok) {
            if (response.status === 403 || response.status === 429) {
                console.warn(`Rate limited when fetching ${owner}/${repo}. Add a GitHub token in js/config.js to increase limits.`);
            } else {
                console.warn(`Failed to fetch issues for ${owner}/${repo}: ${response.status}`);
            }
            return [];
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching issues for ${owner}/${repo}:`, error);
        return [];
    }
}

/**
 * Fetch comments for a specific issue
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @returns {Promise<Array>} Array of comments
 */
export async function fetchIssueComments(owner, repo, issueNumber) {
    try {
        const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
        const response = await fetch(url, { headers: getHeaders() });

        if (!response.ok) {
            if (response.status === 403 || response.status === 429) {
                console.warn(`Rate limited when fetching comments. Add a GitHub token in js/config.js to increase limits.`);
            } else {
                console.warn(`Failed to fetch comments for issue #${issueNumber}: ${response.status}`);
            }
            return [];
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching comments for issue #${issueNumber}:`, error);
        return [];
    }
}

/**
 * Parse points from issue labels
 * Supports formats: "100", "100 points", "100pts", "100 poins", "pts-100", "points-100", "points:100"
 * @param {Array} labels - Array of label objects
 * @returns {number} Points value
 */
export function parsePointsFromLabels(labels) {
    if (!labels || !labels.length) return 0;

    const pointLabel = labels.find(l => {
        // Match: "100", "100 points", "100pts", "100 poins"
        if (/^(\d+)[\s:-]*(points?|poins|pts)?$/i.test(l.name)) return true;

        // Match: "pts-100", "points-100", "points:100", "pts 100"
        if (/^(pts|points?|poins)[\s:-]*(\d+)$/i.test(l.name)) return true;

        return false;
    });

    if (!pointLabel) return 0;

    const match = pointLabel.name.match(/\d+/);
    if (match) {
        return parseInt(match[0], 10);
    }

    return 0;
}

/**
 * Process raw issues from GitHub API
 * @param {Array} issues - Raw issues from API
 * @param {Date} thresholdDate - Threshold date for closed issues
 * @returns {Array} Processed issues
 */
export function processIssues(issues, thresholdDate) {
    const processedIssues = issues.map(issue => ({
        ...issue,
        isPR: !!issue.pull_request,
        points: parsePointsFromLabels(issue.labels)
    }));

    return processedIssues.filter(issue => {
        // For closed items, only include those closed after threshold
        if (issue.state === 'closed') {
            const closedDate = new Date(issue.closed_at);
            return closedDate >= thresholdDate;
        }
        return true;
    });
}

/**
 * Fetch all projects data
 * @param {Array} projects - Array of project configurations
 * @param {Object} settings - Settings object with thresholdDate and perPage
 * @returns {Promise<Array>} Array of projects with their issues
 */
export async function fetchAllProjectsData(projects, settings) {
    const thresholdDate = new Date(settings.thresholdDate);

    const promises = projects.map(async (project) => {
        // Fetch issues and PRs (Issues API returns both, but PRs are simplified)
        // We fetch issues and filter out PRs
        const issuesResponse = await fetchProjectIssues(project.owner, project.repo, settings.perPage);
        const processedIssues = processIssues(issuesResponse, thresholdDate);
        const issuesOnly = processedIssues.filter(i => !i.isPR);

        // Fetch PRs using Pulls API to get merged_at info
        const pullsUrl = `${GITHUB_API_BASE}/repos/${project.owner}/${project.repo}/pulls?state=all&per_page=${settings.perPage}`;
        let prsOnly = [];
        try {
            const prsResponse = await fetch(pullsUrl, { headers: getHeaders() });
            if (prsResponse.ok) {
                const prsRaw = await prsResponse.json();
                prsOnly = prsRaw.filter(pr => {
                    if (pr.state === 'closed') {
                        const closedDate = new Date(pr.closed_at);
                        return closedDate >= thresholdDate;
                    }
                    return true;
                });
            }
        } catch (error) {
            console.error(`Error fetching PRs for ${project.owner}/${project.repo}:`, error);
        }

        // Calculate project stats for issues
        const openCount = issuesOnly.filter(i => i.state === 'open').length;
        const closedCount = issuesOnly.filter(i => i.state === 'closed').length;
        const assignedCount = issuesOnly.filter(i => i.assignee).length;
        const totalPoints = issuesOnly.reduce((sum, i) => sum + i.points, 0);
        const commentsCount = issuesOnly.reduce((sum, i) => sum + i.comments, 0);

        return {
            ...project,
            issues: issuesOnly,
            prs: prsOnly,
            stats: {
                open: openCount,
                closed: closedCount,
                assigned: assignedCount,
                total: issuesOnly.length,
                points: totalPoints,
                comments: commentsCount
            }
        };
    });

    return Promise.all(promises);
}
