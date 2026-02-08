/**
 * Configuration Module
 * Manages app settings including GitHub token from localStorage
 */

export const config = {
    // Get GitHub token from localStorage (user can set this via the settings modal)
    get GITHUB_TOKEN() {
        return localStorage.getItem('github_token') || '';
    },

    // Set GitHub token in localStorage
    set GITHUB_TOKEN(value) {
        if (value && value.trim()) {
            localStorage.setItem('github_token', value.trim());
        } else {
            localStorage.removeItem('github_token');
        }
    },

    // Check if token is configured
    hasToken() {
        return !!this.GITHUB_TOKEN;
    },

    // Clear the token
    clearToken() {
        localStorage.removeItem('github_token');
    }
};
