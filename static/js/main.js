// Main Frontend Application Logic - BigQuery Release Hub

document.addEventListener('DOMContentLoaded', () => {
    // State Management
    let releaseData = null;
    let activeFilter = 'all';
    let searchQuery = '';
    let selectedNoteForTweet = null;
    let selectedTemplateStyle = 'announcement';

    // DOM Elements
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshIcon = document.getElementById('refreshIcon');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    const countTotal = document.getElementById('countTotal');
    const countFeatures = document.getElementById('countFeatures');
    const countChanges = document.getElementById('countChanges');
    
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const filtersContainer = document.getElementById('filtersContainer');
    
    const timelineContainer = document.getElementById('timelineContainer');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const errorOverlay = document.getElementById('errorOverlay');
    const errorMessage = document.getElementById('errorMessage');
    const errorRetryBtn = document.getElementById('errorRetryBtn');
    const emptyState = document.getElementById('emptyState');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');

    // Tweet Modal Elements
    const tweetModal = document.getElementById('tweetModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const previewTag = document.getElementById('previewTag');
    const previewDate = document.getElementById('previewDate');
    const previewText = document.getElementById('previewText');
    const tweetTextArea = document.getElementById('tweetTextArea');
    const characterProgress = document.getElementById('characterProgress');
    const characterCount = document.getElementById('characterCount');
    const charWarning = document.getElementById('charWarning');
    const copyTweetBtn = document.getElementById('copyTweetBtn');
    const shareTweetBtn = document.getElementById('shareTweetBtn');
    const templateButtons = document.querySelectorAll('.btn-template');
    const toastContainer = document.getElementById('toastContainer');

    // Circular Progress Consts
    const CIRCUMFERENCE = 88; // 2 * pi * 14

    // Tweet Templates Generator
    const tweetTemplates = {
        announcement: (note) => {
            const prefix = `🚀 BigQuery ${note.type} (${note.date}): `;
            const suffix = `\n\nRead more: ${note.link} #GoogleCloud #BigQuery`;
            const availableLength = 280 - prefix.length - suffix.length;
            const snippet = getTruncatedSnippet(note.content_text, availableLength);
            return `${prefix}${snippet}${suffix}`;
        },
        insight: (note) => {
            const prefix = `💡 BigQuery Update (${note.type}): `;
            const suffix = `\n\nDetails: ${note.link}`;
            const availableLength = 280 - prefix.length - suffix.length;
            const snippet = getTruncatedSnippet(note.content_text, availableLength);
            return `${prefix}${snippet}${suffix}`;
        },
        summary: (note) => {
            const prefix = `📝 BigQuery Note (${note.date}):\n• `;
            const suffix = `\n\nSource: ${note.link}`;
            const availableLength = 280 - prefix.length - suffix.length;
            const snippet = getTruncatedSnippet(note.content_text, availableLength);
            return `${prefix}${snippet}${suffix}`;
        },
        minimal: (note) => {
            return `BigQuery Release Note (${note.date}): ${note.link}`;
        }
    };

    // Initialize SVG Progress Circle
    characterProgress.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
    characterProgress.style.strokeDashoffset = CIRCUMFERENCE;

    // Toast Notification helper
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconName = 'check_circle';
        if (type === 'error') iconName = 'error';
        if (type === 'info') iconName = 'info';

        toast.innerHTML = `
            <span class="material-symbols-outlined toast-icon ${type}">${iconName}</span>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);

        // Slide out and remove
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    // Helper: Smart String Truncate
    function getTruncatedSnippet(text, maxLength) {
        if (maxLength <= 0) return '';
        // Clean up excessive whitespace
        const cleanText = text.replace(/\s+/g, ' ').trim();
        if (cleanText.length <= maxLength) return cleanText;
        return cleanText.substring(0, maxLength - 3) + '...';
    }

    // API Call: Fetch Data
    async function fetchReleaseNotes(forceRefresh = false) {
        setLoading(true);
        try {
            const url = forceRefresh ? '/api/notes?refresh=true' : '/api/notes';
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.status === 'error') {
                throw new Error(result.message);
            }
            
            releaseData = result.data;
            
            // Render Status details
            const dateStr = new Date(releaseData.fetched_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            if (result.status === 'warning') {
                setStatus('warning', `Stale (${result.message})`);
                showToast(result.message, 'error');
            } else {
                setStatus('success', `Refreshed at ${dateStr}`);
                if (forceRefresh) {
                    showToast('Release notes successfully updated!', 'success');
                }
            }
            
            // Build UI
            calculateStats();
            renderTimeline();
            
        } catch (error) {
            console.error('Error fetching release notes:', error);
            setStatus('error', 'Error loading feed');
            showError(error.message);
        } finally {
            setLoading(false);
        }
    }

    // Set Loading UI State
    function setLoading(isLoading) {
        if (isLoading) {
            refreshIcon.classList.add('spinning');
            refreshBtn.disabled = true;
            loadingOverlay.style.display = 'flex';
            errorOverlay.style.display = 'none';
            timelineContainer.style.display = 'none';
            emptyState.style.display = 'none';
            
            const pulse = statusIndicator.querySelector('.pulse-dot');
            pulse.className = 'pulse-dot loading';
            statusText.textContent = 'Updating...';
        } else {
            refreshIcon.classList.remove('spinning');
            refreshBtn.disabled = false;
            loadingOverlay.style.display = 'none';
        }
    }

    // Set Status text
    function setStatus(type, text) {
        const pulse = statusIndicator.querySelector('.pulse-dot');
        pulse.className = `pulse-dot ${type}`;
        statusText.textContent = text;
    }

    // Show Error State
    function showError(msg) {
        errorMessage.textContent = msg || 'Could not parse or fetch release data. Check the server logs.';
        errorOverlay.style.display = 'flex';
        timelineContainer.style.display = 'none';
        emptyState.style.display = 'none';
    }

    // Calculate Dashboard metrics
    function calculateStats() {
        if (!releaseData || !releaseData.entries) return;
        
        let totalCount = 0;
        let featureCount = 0;
        let changeAndFixCount = 0;
        
        releaseData.entries.forEach(entry => {
            entry.updates.forEach(update => {
                totalCount++;
                const typeLower = update.type.toLowerCase();
                if (typeLower === 'feature') {
                    featureCount++;
                } else if (typeLower === 'changed' || typeLower === 'fixed' || typeLower === 'deprecated') {
                    changeAndFixCount++;
                }
            });
        });
        
        countTotal.textContent = totalCount;
        countFeatures.textContent = featureCount;
        countChanges.textContent = changeAndFixCount;
    }

    // Render Timeline Feed
    function renderTimeline() {
        timelineContainer.innerHTML = '';
        
        if (!releaseData || !releaseData.entries || releaseData.entries.length === 0) {
            showEmptyState(true);
            return;
        }

        let totalGroupsRendered = 0;
        
        // Loop dates (each entry is a day)
        releaseData.entries.forEach(entry => {
            // Filter updates within the day
            const filteredUpdates = entry.updates.filter(update => {
                // Category Filter check
                if (activeFilter !== 'all') {
                    // Normalize general categories
                    const currentType = update.type.toLowerCase();
                    const filterType = activeFilter.toLowerCase();
                    if (currentType !== filterType) return false;
                }
                
                // Keyword Search check
                if (searchQuery.trim() !== '') {
                    const text = update.content_text.toLowerCase();
                    const query = searchQuery.toLowerCase();
                    if (!text.includes(query) && !update.type.toLowerCase().includes(query)) {
                        return false;
                    }
                }
                
                return true;
            });

            // If day has matching updates, render it
            if (filteredUpdates.length > 0) {
                totalGroupsRendered++;
                
                const groupElement = document.createElement('section');
                groupElement.className = 'timeline-group';
                
                // Parse date relative description (e.g., 'Today', 'Yesterday')
                const relativeText = getRelativeDateLabel(entry.updated);
                
                groupElement.innerHTML = `
                    <div class="timeline-date-marker">
                        <div class="timeline-dot"></div>
                        <h2 class="timeline-date-text">${entry.date}</h2>
                        ${relativeText ? `<span class="timeline-date-ago">${relativeText}</span>` : ''}
                    </div>
                    <div class="timeline-updates-list"></div>
                `;
                
                const listContainer = groupElement.querySelector('.timeline-updates-list');
                
                filteredUpdates.forEach(update => {
                    const card = document.createElement('article');
                    card.className = `update-card type-${update.type.toLowerCase()}`;
                    
                    // Create direct shareable anchor link
                    const updateAnchor = `${entry.link}`;
                    
                    card.innerHTML = `
                        <div class="update-card-header">
                            <div class="update-card-meta">
                                <span class="update-badge ${update.type.toLowerCase()}">${update.type}</span>
                            </div>
                            <div class="update-actions">
                                <button class="action-icon-btn btn-link-trigger" title="Open Google Documentation source" data-link="${updateAnchor}">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                                <button class="action-icon-btn btn-copy-trigger" title="Copy link to clipboard" data-link="${updateAnchor}">
                                    <span class="material-symbols-outlined">link</span>
                                </button>
                                <button class="action-icon-btn btn-copy-text-trigger" title="Copy update text to clipboard">
                                    <span class="material-symbols-outlined">content_copy</span>
                                </button>
                                <button class="action-icon-btn btn-tweet-trigger" title="Draft Tweet about this update">
                                    <svg class="twitter-logo-svg" viewBox="0 0 24 24" width="16" height="16">
                                        <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="update-card-body">
                            ${update.content_html}
                        </div>
                    `;

                    // Bind Actions
                    card.querySelector('.btn-link-trigger').addEventListener('click', (e) => {
                        window.open(updateAnchor, '_blank', 'noopener,noreferrer');
                    });

                    card.querySelector('.btn-copy-trigger').addEventListener('click', (e) => {
                        navigator.clipboard.writeText(updateAnchor).then(() => {
                            showToast('Direct link copied to clipboard!', 'info');
                        }).catch(err => {
                            showToast('Could not copy link.', 'error');
                        });
                    });

                    card.querySelector('.btn-copy-text-trigger').addEventListener('click', (e) => {
                        navigator.clipboard.writeText(update.content_text).then(() => {
                            showToast('Update content copied to clipboard!', 'info');
                        }).catch(err => {
                            showToast('Could not copy text.', 'error');
                        });
                    });

                    card.querySelector('.btn-tweet-trigger').addEventListener('click', () => {
                        openTweetComposer({
                            date: entry.date,
                            link: entry.link,
                            type: update.type,
                            content_text: update.content_text
                        });
                    });

                    listContainer.appendChild(card);
                });
                
                timelineContainer.appendChild(groupElement);
            }
        });

        // Show empty state if nothing matched
        if (totalGroupsRendered === 0) {
            showEmptyState(true);
            timelineContainer.style.display = 'none';
        } else {
            showEmptyState(false);
            timelineContainer.style.display = 'flex';
        }
    }

    // Convert release date ISO into a human readable helper ("Today", "Yesterday", "5 days ago", etc)
    function getRelativeDateLabel(isoString) {
        try {
            const today = new Date();
            // Zero out times
            today.setHours(0,0,0,0);
            
            const releaseDate = new Date(isoString);
            releaseDate.setHours(0,0,0,0);
            
            const diffTime = today - releaseDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago`;
            return '';
        } catch (e) {
            return '';
        }
    }

    // Toggle Empty State Visibility
    function showEmptyState(show) {
        emptyState.style.display = show ? 'flex' : 'none';
    }

    // Modal Operations: Open Composer
    function openTweetComposer(note) {
        selectedNoteForTweet = note;
        
        // Populate static details
        previewTag.className = `update-badge ${note.type.toLowerCase()}`;
        previewTag.textContent = note.type;
        previewDate.textContent = note.date;
        previewText.textContent = note.content_text;
        
        // Select initial template
        selectedTemplateStyle = 'announcement';
        templateButtons.forEach(btn => {
            if (btn.dataset.style === 'announcement') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Generate content based on template
        generateTweetContent();
        
        // Show modal
        tweetModal.classList.add('show');
        tweetTextArea.focus();
    }

    // Close Modal
    function closeTweetModal() {
        tweetModal.classList.remove('show');
        selectedNoteForTweet = null;
    }

    // Generate Tweet content text in textarea based on active template and note
    function generateTweetContent() {
        if (!selectedNoteForTweet) return;
        const generator = tweetTemplates[selectedTemplateStyle];
        if (generator) {
            tweetTextArea.value = generator(selectedNoteForTweet);
            updateCharacterCounter();
        }
    }

    // Update character counts and indicators
    function updateCharacterCounter() {
        const text = tweetTextArea.value;
        const len = text.length;
        
        // X recommended limit is 280
        const limit = 280;
        const remainder = limit - len;
        
        characterCount.textContent = remainder;
        
        // Calculate progress percentage
        const progressPercentage = Math.min(len / limit, 1);
        const strokeOffset = CIRCUMFERENCE - (progressPercentage * CIRCUMFERENCE);
        
        characterProgress.style.strokeDashoffset = strokeOffset;
        
        // Update color states
        if (remainder < 0) {
            characterProgress.style.stroke = '#ef4444'; // Red danger
            characterCount.classList.add('danger');
            charWarning.style.display = 'inline-flex';
        } else if (remainder <= 20) {
            characterProgress.style.stroke = '#f59e0b'; // Amber warning
            characterCount.classList.remove('danger');
            charWarning.style.display = 'none';
        } else {
            characterProgress.style.stroke = '#1d9bf0'; // Standard X Blue
            characterCount.classList.remove('danger');
            charWarning.style.display = 'none';
        }
    }

    // Copy draft tweet to clipboard
    function copyTweetText() {
        const text = tweetTextArea.value;
        navigator.clipboard.writeText(text).then(() => {
            showToast('Tweet content copied to clipboard!', 'success');
        }).catch(err => {
            showToast('Failed to copy text.', 'error');
        });
    }

    // Open X Intent
    function shareTweet() {
        const text = encodeURIComponent(tweetTextArea.value);
        const url = `https://twitter.com/intent/tweet?text=${text}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    // Event Listeners: Filtering
    filtersContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            // Remove active class from other pills
            filtersContainer.querySelectorAll('.filter-pill').forEach(pill => {
                pill.classList.remove('active');
            });
            
            // Add active class to clicked pill
            e.target.classList.add('active');
            
            activeFilter = e.target.dataset.type;
            renderTimeline();
        }
    });

    // Event Listeners: Searching
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        
        // Display clear button
        if (searchQuery.length > 0) {
            clearSearchBtn.style.display = 'flex';
        } else {
            clearSearchBtn.style.display = 'none';
        }
        
        renderTimeline();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderTimeline();
        searchInput.focus();
    });

    resetFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        
        filtersContainer.querySelectorAll('.filter-pill').forEach(pill => {
            if (pill.dataset.type === 'all') {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
        activeFilter = 'all';
        renderTimeline();
    });

    // Export currently filtered list to CSV file
    function exportToCSV() {
        if (!releaseData || !releaseData.entries) {
            showToast('No data available to export.', 'error');
            return;
        }

        const records = [];
        releaseData.entries.forEach(entry => {
            entry.updates.forEach(update => {
                // Category Filter check
                if (activeFilter !== 'all') {
                    const currentType = update.type.toLowerCase();
                    const filterType = activeFilter.toLowerCase();
                    if (currentType !== filterType) return;
                }
                
                // Keyword Search check
                if (searchQuery.trim() !== '') {
                    const text = update.content_text.toLowerCase();
                    const query = searchQuery.toLowerCase();
                    if (!text.includes(query) && !update.type.toLowerCase().includes(query)) return;
                }
                
                records.push({
                    date: entry.date,
                    type: update.type,
                    link: entry.link,
                    content: update.content_text
                });
            });
        });

        if (records.length === 0) {
            showToast('No matching records found to export.', 'error');
            return;
        }

        // CSV formatting helpers
        const headers = ['Date', 'Type', 'Source Link', 'Content Details'];
        const escapeCsvVal = (val) => {
            if (val === null || val === undefined) return '';
            const cleaned = String(val).replace(/"/g, '""');
            return `"${cleaned}"`;
        };

        let csvString = headers.map(escapeCsvVal).join(',') + '\n';
        records.forEach(rec => {
            const row = [rec.date, rec.type, rec.link, rec.content];
            csvString += row.map(escapeCsvVal).join(',') + '\n';
        });

        // Trigger browser download
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const downloadUrl = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        const fileSuffix = activeFilter !== 'all' ? `_${activeFilter.toLowerCase()}` : '';
        
        downloadAnchor.setAttribute('href', downloadUrl);
        downloadAnchor.setAttribute('download', `bigquery_releases${fileSuffix}.csv`);
        downloadAnchor.style.visibility = 'hidden';
        
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
        
        showToast(`Exported ${records.length} updates to CSV!`, 'success');
    }

    // Event Listeners: Export
    exportCsvBtn.addEventListener('click', exportToCSV);

    // Event Listeners: Refresh
    refreshBtn.addEventListener('click', () => {
        fetchReleaseNotes(true); // force refresh
    });

    errorRetryBtn.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Event Listeners: Modal
    closeModalBtn.addEventListener('click', closeTweetModal);
    
    // Close modal on clicking backdrop
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) {
            closeTweetModal();
        }
    });

    // Template Selector Clicking
    templateButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnTarget = e.currentTarget;
            
            // Remove active classes
            templateButtons.forEach(b => b.classList.remove('active'));
            btnTarget.classList.add('active');
            
            selectedTemplateStyle = btnTarget.dataset.style;
            generateTweetContent();
        });
    });

    // Textarea editing event
    tweetTextArea.addEventListener('input', updateCharacterCounter);

    // Modal Action Buttons
    copyTweetBtn.addEventListener('click', copyTweetText);
    shareTweetBtn.addEventListener('click', shareTweet);

    // Initial Load
    fetchReleaseNotes(false);
});
