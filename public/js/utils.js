/**
 * Utility functions for formatting and calculations.
 */
const Utils = {
    formatCurrency: (value) => {
        const num = parseFloat(value) || 0;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(num);
    },

    formatPercent: (value) => {
        const num = parseFloat(value) || 0;
        return `${num.toFixed(2)}%`;
    },

    formatPoints: (value) => {
        const num = parseInt(value) || 0;
        return num.toLocaleString();
    },

    formatDate: (timestamp) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return date.toLocaleDateString();
    },

    truncateAddress: (address) => {
        if (!address) return '';
        if (address.length <= 12) return address;
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
};

window.Utils = Utils;
