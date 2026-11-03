// Global state
let chart = null;
let currentChartData = null;

// Sidebar functionality
async function loadStats(period = 'weekly') {
  try {
    const response = await fetch(`/api/admin/reports/bookings-stats?period=${period}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        window.location.href = '/login';
        return;
      }
      throw new Error('Errore caricamento statistiche');
    }

    currentChartData = await response.json();
    renderChart(currentChartData);
    updateStats(currentChartData);
  } catch (error) {
    console.error('Errore:', error);
  }
}

// I colori del grafico seguono i token del tema (rame del logo su fili sottili)
function getChartColors() {
  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    grid: token('--paper-3', '#262626'),
    text: token('--ink-3', '#999999'),
    barBg: token('--accent', '#d97030'),
    barBorder: token('--accent', '#d97030')
  };
}

function renderChart(data) {
  if (!data) return;

  const ctx = document.getElementById('bookings-chart').getContext('2d');
  const colors = getChartColors();

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Tagli Effettuati',
          data: data.counts,
          backgroundColor: colors.barBg,
          borderColor: colors.barBorder,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: colors.text
          },
          grid: {
            color: colors.grid,
            borderColor: colors.grid
          }
        },
        x: {
          ticks: {
            color: colors.text
          },
          grid: {
            color: colors.grid,
            borderColor: colors.grid
          }
        }
      }
    }
  });
}

function updateStats(data) {
  const total = data.counts.reduce((a, b) => a + b, 0);
  const avg = data.counts.length > 0 ? (total / data.counts.length).toFixed(1) : 0;
  const max = Math.max(...data.counts, 0);

  document.getElementById('total-bookings').textContent = total;
  document.getElementById('avg-bookings').textContent = avg;
  document.getElementById('max-bookings').textContent = max;
}

// Filter change
document.getElementById('period-filter').addEventListener('change', e => {
  loadStats(e.target.value);
});

// Listen for theme changes to redraw chart
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
      if (currentChartData) {
        renderChart(currentChartData);
      }
    }
  });
});

observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});

// Init
setupSidebar();
loadStats('weekly');
