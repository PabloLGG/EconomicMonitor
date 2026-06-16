import type { ForwardOutlook } from '../analysis/recessionTypes';
import { formatMonthYear, formatRecessionProbability } from './predictionRows';

export function renderForwardOutlookPanel(el: HTMLElement, outlook: ForwardOutlook): void {
  const horizonRows = outlook.horizonProbs
    .map(
      (h) => `
        <div class="outlook-horizon-row">
          <span class="outlook-horizon-label">${h.months / 12} year${h.months > 12 ? 's' : ''}</span>
          <span class="outlook-horizon-value">${formatRecessionProbability(h.probability)}</span>
        </div>
      `,
    )
    .join('');

  const scenarioRows = outlook.scenarios
    .map(
      (s) => `
        <li>
          ${formatMonthYear(s.start)} · ${Math.round(s.weight * 100)}% · peak hazard ${formatRecessionProbability(s.peakP)}
        </li>
      `,
    )
    .join('');

  const attributionRows = outlook.attribution
    .slice(0, 5)
    .map((a) => `<li><strong>${a.feature}</strong> ${a.contribution >= 0 ? '+' : ''}${(a.contribution * 100).toFixed(1)}%</li>`)
    .join('');

  const nextRecession = outlook.nextRecession.medianStart
    ? formatMonthYear(outlook.nextRecession.medianStart)
    : 'None in 5-year window';
  const range =
    outlook.nextRecession.p25 && outlook.nextRecession.p75
      ? `${formatMonthYear(outlook.nextRecession.p25)} – ${formatMonthYear(outlook.nextRecession.p75)}`
      : 'Wide uncertainty';

  el.innerHTML = `
    <section class="forward-outlook" aria-labelledby="forward-outlook-title">
      <h2 id="forward-outlook-title" class="forward-outlook-title">Forward recession outlook</h2>
      <p class="forward-outlook-lead">
        Based on the latest data (${formatMonthYear(outlook.anchorDate)}), the model simulates correlation
        dynamics over the next <strong>5 years</strong> using Monte Carlo roll-forward of the trained neural network.
      </p>

      <div class="forward-outlook-grid">
        <div class="forward-outlook-card">
          <h3>When is the next recession?</h3>
          <p class="forward-outlook-highlight">${nextRecession}</p>
          <p class="forward-outlook-meta">Likely range: ${range}</p>
          ${outlook.scenarios.length ? `<ul class="forward-outlook-scenarios">${scenarioRows}</ul>` : ''}
        </div>

        <div class="forward-outlook-card">
          <h3>Probability by horizon</h3>
          <div class="forward-outlook-horizons">${horizonRows}</div>
        </div>

        <div class="forward-outlook-card">
          <h3>Model confidence</h3>
          <p class="forward-outlook-highlight">${Math.round(outlook.confidenceScore * 100)}%</p>
          <p class="forward-outlook-meta">
            Higher when scenario onset dates cluster; lower when multiple recession paths are plausible.
          </p>
        </div>

        <div class="forward-outlook-card">
          <h3>Top drivers</h3>
          ${
            attributionRows
              ? `<ul class="forward-outlook-attribution">${attributionRows}</ul>`
              : '<p class="forward-outlook-meta">Attribution available after model retrain.</p>'
          }
        </div>
      </div>

      <p class="forward-outlook-disclaimer">
        Forecast region uses rolled correlation paths with yield curve held flat. Uncertainty bands reflect
        Monte Carlo variation, not NBER forecast accuracy. Historical feature engineering (36-month rolling
        correlation) is unchanged.
      </p>
    </section>
  `;
}
