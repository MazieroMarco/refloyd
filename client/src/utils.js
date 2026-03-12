export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function getInitials(text = '') {
    return text
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

export function getProfileAvatarHtml(profile, imageClass, fallbackClass = imageClass) {
    if (profile?.avatar_image) {
        return `<img class="${imageClass}" src="${profile.avatar_image}" alt="${escapeHtml(profile.name || 'Profile')}" loading="lazy" />`;
    }

    return `<div class="${fallbackClass}">${escapeHtml(getInitials(profile?.name || 'P'))}</div>`;
}

export function applyHeroImage(element, imageUrl) {
    if (!element || !imageUrl) {
        return;
    }

    element.classList.add('has-artwork');
    element.style.setProperty('--hero-image', `url("${imageUrl}")`);
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
