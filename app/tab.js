function switchTab(tab) {
    const tabs = ['home', 'connections', 'settings'];

    tabs.forEach(t => {
        const tabContent = document.querySelector(".tab." + t);
        const tabButton = document.querySelector(".tab-btn." + t);

        if (t === tab) {
            tabContent.classList.remove('hidden');

            tabButton.classList.remove('text-gray-500', 'border-transparent');
            tabButton.classList.add('text-gray-900', 'border-gray-900');
        } else {
            tabContent.scrollTop = 0;
            tabContent.classList.add('hidden');

            tabButton.classList.remove('text-gray-900', 'border-gray-900');
            tabButton.classList.add('text-gray-500', 'border-transparent');
        }
    });
}