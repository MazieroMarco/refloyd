export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatMentions(text) {
    return text.replace(/@(\w+(?:\s\w+)*)/g, '<span class="mention-tag">@$1</span>');
}

export function formatCommentDate(value) {
    const date = new Date(`${value}Z`);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
