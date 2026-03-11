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
        let allIssues = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore && page <= 10) {
            const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?state=all&per_page=${perPage}&page=${page}`;
            const response = await fetch(url, { headers: getHeaders() });

            if (!response.ok) {
                if (response.status === 403 || response.status === 429) {
                    console.warn(`Rate limited when fetching ${owner}/${repo}. Add a GitHub token in js/config.js to increase limits.`);
                } else {
                    console.warn(`Failed to fetch issues for ${owner}/${repo}: ${response.status}`);
                }
                break;
            }

            const data = await response.json();
            if (data.length === 0) {
                hasMore = false;
            } else {
                allIssues = allIssues.concat(data);
                if (data.length < perPage) {
                    hasMore = false;
                }
            }
            page++;
        }
        
        return allIssues;
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

    let points = 0;

    labels.forEach(l => {
        const name = l.name.trim();
        
        // Exact numeric label (e.g., "100")
        if (/^\d+$/.test(name)) {
            points += parseInt(name, 10);
            return;
        }

        // Number followed by point indicator (e.g., "Level 1: 100 points", "100 pts")
        let match = name.match(/(\d+)[\s:-]*(points?|poins|pts)\b/i);
        if (match) {
            points += parseInt(match[1], 10);
            return;
        }

        // Point indicator followed by number (e.g., "Points: 100", "pts-100")
        match = name.match(/\b(points?|poins|pts)[\s:-]*(\d+)/i);
        if (match) {
            points += parseInt(match[2], 10);
            return;
        }
    });

    return points;
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

        // Fetch PRs using Pulls API to get merged_at info. Paginate to get all.
        let prsOnly = [];
        let prPage = 1;
        let hasMorePrs = true;
        
        while(hasMorePrs && prPage <= 10) {
            const pullsUrl = `${GITHUB_API_BASE}/repos/${project.owner}/${project.repo}/pulls?state=all&per_page=${settings.perPage}&page=${prPage}`;
            try {
                const prsResponse = await fetch(pullsUrl, { headers: getHeaders() });
                if (!prsResponse.ok) break;
                
                const prsRaw = await prsResponse.json();
                if (prsRaw.length === 0) {
                    hasMorePrs = false;
                } else {
                    const filtered = prsRaw.filter(pr => {
                        if (pr.state === 'closed') {
                            const closedDate = new Date(pr.closed_at);
                            return closedDate >= thresholdDate;
                        }
                        return true;
                    });
                    prsOnly = prsOnly.concat(filtered);
                    
                    if (prsRaw.length < settings.perPage) {
                        hasMorePrs = false;
                    }
                }
                prPage++;
            } catch (error) {
                console.error(`Error fetching PRs for ${project.owner}/${project.repo}:`, error);
                break;
            }
        }

        // Calculate project stats for issues
        const openCount = issuesOnly.filter(i => i.state === 'open').length;
        const closedCount = issuesOnly.filter(i => i.state === 'closed').length;
        const assignedCount = issuesOnly.filter(i => (i.assignees && i.assignees.length > 0) || !!i.assignee).length;
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
