document.addEventListener('DOMContentLoaded', async () => {
  const tableContentElement = document.getElementById('table-content');
  const selectorElement = document.getElementById('instance-select');
  const lastUpdate = document.getElementById('last-update');

  selectorElement.onchange = (e) => {
    const instance = e.target.value;
    render(instance);
  };

  async function render(instance) {
    tableContentElement.innerHTML = shimmersHtml;
    const response = await fetch('/api/get/borrowers/' + instance);
    const data = await response.json();

    lastUpdate.innerText = 'Data as of ' + new Date(data.ts).toLocaleString();
    const borrowersToDisplay = data.borrowers.slice(0, 100);
    const baseSymbol = Object.keys(data.assets)[0];

    let html = headerHtml;
    borrowersToDisplay.forEach((borrowerData, i) => {
      const liquidatable = borrowerData.isLiquidatable ? 'liquidatable' : '';
      html += `
        <div class="row ${liquidatable}">
          <div class="cell">${borrowerData.account}</div>
          <div class="cell">${`${(borrowerData.borrowBalance).toFixed(3)} ${baseSymbol}`}</div>
          <div class="cell">${Object.keys(borrowerData.collaterals).join(', ')}</div>
          <div class="cell">${borrowerData.percentToLiquidation.toFixed(2)}%</div>
        </div>`
    });

    tableContentElement.innerHTML = html;
  }

  render(selectorElement.children[0].value);
});

const shimmersHtml = `
  <div class="row">
    <div class="cell cell-shimmer">
      <div class="shimmer"></div>
    </div>
  </div>
  <div class="row">
    <div class="cell cell-shimmer">
      <div class="shimmer"></div>
    </div>
  </div>
  <div class="row">
    <div class="cell cell-shimmer">
      <div class="shimmer"></div>
    </div>
  </div>
  <div class="row">
    <div class="cell cell-shimmer">
      <div class="shimmer"></div>
    </div>
  </div>
  <div class="row">
    <div class="cell cell-shimmer">
      <div class="shimmer"></div>
    </div>
  </div>
  <div class="row">
    <div class="cell cell-shimmer">
      <div class="shimmer"></div>
    </div>
  </div>
`;

const headerHtml = `
  <div class="header-row">
    <div class="cell">Account Address</div>
    <div class="cell">Borrow Size</div>
    <div class="cell">Collateral Assets</div>
    <div class="cell">Percentage To Underwater</div>
  </div>`;
