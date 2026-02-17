/**
 * Filters Module
 * Handles filtering, sorting, and contributor leaderboard logic
 */

export const defaultFilters = {
    status: 'open',
    assignment: 'all',
    comments: 'all',
    points: 'all',
    sortBy: 'order',
    sortOrder: 'asc',
    contribSort: 'points'
};

export function filterIssues(issues, filters) {
    return issues.filter(issue => {
        if (filters.status !== 'all') {
            if (filters.status === 'open' && issue.state !== 'open') return false;
            if (filters.status === 'closed' && issue.state !== 'closed') return false;
        }
        if (filters.assignment !== 'all') {
            if (filters.assignment === 'assigned' && !issue.assignee) return false;
            if (filters.assignment === 'unassigned' && issue.assignee) return false;
        }
        if (filters.comments !== 'all') {
            if (filters.comments === 'has-comments' && issue.comments === 0) return false;
            if (filters.comments === 'no-comments' && issue.comments > 0) return false;
        }
        if (filters.points === 'has-points' && issue.points === 0) return false;
        return true;
    });
}

export function applyFilters(projects, filters) {
    return projects.map(project => {
        const filteredIssues = filterIssues(project.issues, filters);
        const filteredStats = {
            open: filteredIssues.filter(i => i.state === 'open').length,
            closed: filteredIssues.filter(i => i.state === 'closed').length,
            assigned: filteredIssues.filter(i => i.assignee).length,
            total: filteredIssues.length,
            points: filteredIssues.reduce((sum, i) => sum + i.points, 0),
            comments: filteredIssues.reduce((sum, i) => sum + i.comments, 0)
        };
        return { ...project, filteredIssues, filteredStats };
    });
}

export function sortProjects(projects, sortBy, sortOrder) {
    return [...projects].sort((a, b) => {
        let aVal, bVal;
        switch (sortBy) {
            case 'order':
                aVal = a.order ?? 999;
                bVal = b.order ?? 999;
                break;
            case 'points':
                aVal = a.filteredStats?.points ?? a.stats.points;
                bVal = b.filteredStats?.points ?? b.stats.points;
                break;
            case 'issues':
                aVal = a.filteredStats?.total ?? a.stats.total;
                bVal = b.filteredStats?.total ?? b.stats.total;
                break;
            case 'closed':
                aVal = a.filteredStats?.closed ?? a.stats.closed;
                bVal = b.filteredStats?.closed ?? b.stats.closed;
                break;
            case 'name':
                return sortOrder === 'asc'
                    ? a.name.localeCompare(b.name, 'ar')
                    : b.name.localeCompare(a.name, 'ar');
            default:
                aVal = a.order ?? 999;
                bVal = b.order ?? 999;
        }
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
}

export function calculateGlobalStats(projects, thresholdDate) {
    const allIssues = projects.flatMap(p => p.issues);

    const openIssues = allIssues.filter(i => i.state === 'open');
    const issuesWithComments = allIssues.filter(i => i.comments > 0);
    const issuesWithAssignees = allIssues.filter(i => i.assignee);
    const closedSinceThreshold = allIssues.filter(i => {
        if (i.state !== 'closed' || !i.closed_at) return false;
        return new Date(i.closed_at) >= new Date(thresholdDate);
    });

    const totalPoints = allIssues.reduce((sum, i) => sum + i.points, 0);
    const collectedPoints = closedSinceThreshold.reduce((sum, i) => sum + i.points, 0);

    return {
        open: openIssues.length,
        withComments: issuesWithComments.length,
        withAssignees: issuesWithAssignees.length,
        closedSince: closedSinceThreshold.length,
        totalPoints,
        collectedPoints
    };
}

export function getVisibleProjects(projects) {
    return projects.filter(p => (p.filteredStats?.total ?? p.stats.total) > 0);
}

/**
 * Build contributor leaderboard from all issues
 * Contributors are ranked by points from closed issues since threshold date
 */
export function buildContributorLeaderboard(projects, thresholdDate, sortBy = 'points') {
    const contributors = new Map();

    projects.forEach(project => {
        project.issues.forEach(issue => {
            // Track assignees for assigned issues
            if (issue.assignee) {
                const username = issue.assignee.login;
                if (!contributors.has(username)) {
                    contributors.set(username, {
                        username,
                        avatar_url: issue.assignee.avatar_url,
                        html_url: issue.assignee.html_url,
                        assignedIssues: [],
                        closedIssuesWithPoints: [],
                        totalPoints: 0,
                        closedCount: 0,
                        assignedCount: 0
                    });
                }

                const contributor = contributors.get(username);
                contributor.assignedIssues.push({
                    ...issue,
                    projectName: project.name,
                    owner: project.owner,
                    repo: project.repo
                });
                contributor.assignedCount++;

                // If this issue is closed after threshold and has points, count it
                if (issue.state === 'closed' && issue.closed_at) {
                    const closedDate = new Date(issue.closed_at);
                    if (closedDate >= new Date(thresholdDate)) {
                        if (issue.points > 0) {
                            contributor.closedIssuesWithPoints.push({
                                ...issue,
                                projectName: project.name,
                                owner: project.owner,
                                repo: project.repo
                            });
                            contributor.totalPoints += issue.points;
                        }
                        contributor.closedCount++;
                    }
                }
            }
        });
    });

    // Convert to array and sort
    let leaderboard = Array.from(contributors.values());

    switch (sortBy) {
        case 'points':
            leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
            break;
        case 'closed':
            leaderboard.sort((a, b) => b.closedCount - a.closedCount);
            break;
        case 'assigned':
            leaderboard.sort((a, b) => b.assignedCount - a.assignedCount);
            break;
    }

    return leaderboard;
}

/**
 * Calculate daily counts for assigned and closed issues within a date range
 * @param {Array} projects - Array of projects
 * @param {string} startDateStr - Start date string
 * @param {string} endDateStr - End date string
 * @returns {Object} { assigned: { 'YYYY-MM-DD': count }, closed: { 'YYYY-MM-DD': count } }
 */
export function calculateDailyCounts(projects, startDateStr, endDateStr) {
    const data = {
        assigned: {},
        closed: {},
        merged_prs: {},
        open_prs: {}
    };

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    // Initialize all days in range with 0
    let curr = new Date(start);
    while (curr <= end) {
        const dateStr = curr.toISOString().split('T')[0];
        data.assigned[dateStr] = 0;
        data.closed[dateStr] = 0;
        data.merged_prs[dateStr] = 0;
        data.open_prs[dateStr] = 0;
        curr.setDate(curr.getDate() + 1);
    }

    projects.forEach(project => {
        // Process Issues
        project.issues.forEach(issue => {
            // Assigned
            if (issue.created_at) {
                const dateStr = new Date(issue.created_at).toISOString().split('T')[0];
                if (data.assigned[dateStr] !== undefined) {
                    data.assigned[dateStr]++;
                }
            }

            // Closed
            if (issue.state === 'closed' && issue.closed_at) {
                const dateStr = new Date(issue.closed_at).toISOString().split('T')[0];
                if (data.closed[dateStr] !== undefined) {
                    data.closed[dateStr]++;
                }
            }
        });

        // Process PRs
        if (project.prs) {
            project.prs.forEach(pr => {
                const dateCreated = new Date(pr.created_at).toISOString().split('T')[0];

                if (pr.state === 'closed' && pr.closed_at) {
                    const dateClosed = new Date(pr.closed_at).toISOString().split('T')[0];
                    if (data.merged_prs[dateClosed] !== undefined) {
                        data.merged_prs[dateClosed]++;
                    }
                } else if (pr.state === 'open') {
                    if (data.open_prs[dateCreated] !== undefined) {
                        data.open_prs[dateCreated]++;
                    }
                }
            });
        }
    });

    return data;
}
