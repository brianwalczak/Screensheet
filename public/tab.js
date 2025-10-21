const label = document.querySelector('.label');

function switchTab(tab) {
    const tabs = ['code', 'login'];
    if (!tabs.includes(tab)) return;

    tabs.forEach(t => {
        try {
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
        } catch (error) {
            console.warn("Error switching tabs, likely don't exist: ", error);
        }
    });

    switch (tab) {
        case 'code':
            label.textContent = 'Enter a connection code to view a shared screen';
            break;
        case 'login':
            label.textContent = 'Enter your credentials to access the shared screen';
            break;
    }
}