const savedTheme = localStorage.getItem('tiramisu-theme');
const theme = savedTheme === 'night' ? 'night' : 'day';
const themeColour = theme === 'night' ? '#171b22' : '#fbfaf7';

document.documentElement.dataset.theme = theme;
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute('content', themeColour);
