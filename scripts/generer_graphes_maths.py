import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

OUT = sys.argv[1]
EXT = sys.argv[2] if len(sys.argv) > 2 else "svg"
ACCENT, ACCENT2, INK, GRID = "#4f46e5", "#e11d74", "#1f2333", "#e3e6ee"
plt.rcParams.update({
    "svg.fonttype": "none", "font.family": "sans-serif", "font.size": 12,
    "axes.edgecolor": INK, "text.color": INK, "xtick.color": INK, "ytick.color": INK,
})

def repere(ax, xmin, xmax, ymin, ymax):
    """Repère orthonormé avec axes passant par l'origine et quadrillage unité."""
    ax.set_xlim(xmin, xmax); ax.set_ylim(ymin, ymax); ax.set_aspect("equal")
    ax.set_xticks(range(xmin, xmax + 1)); ax.set_yticks(range(ymin, ymax + 1))
    ax.grid(True, color=GRID, linewidth=1); ax.set_axisbelow(True)
    for s in ("left", "bottom"): ax.spines[s].set_position("zero")
    for s in ("right", "top"): ax.spines[s].set_visible(False)
    ax.tick_params(labelsize=10)
    ax.set_xticklabels([str(t) if t != 0 else "" for t in range(xmin, xmax + 1)])
    ax.set_yticklabels([str(t) if t != 0 else "" for t in range(ymin, ymax + 1)])
    ax.plot(1, 0, ">", color=INK, transform=ax.get_yaxis_transform(), clip_on=False)
    ax.plot(0, 1, "^", color=INK, transform=ax.get_xaxis_transform(), clip_on=False)
    ax.text(xmax, -0.45, "x", ha="right", va="top", fontsize=12, style="italic")
    ax.text(0.2, ymax, "y", ha="left", va="top", fontsize=12, style="italic")
    ax.text(-0.15, -0.15, "O", ha="right", va="top", fontsize=10)

def save(fig, name):
    fig.savefig(f"{OUT}/{name}.{EXT}", bbox_inches="tight", pad_inches=0.15, dpi=110, facecolor="white")
    plt.close(fig)

# Q1 — droite y = 2x + 1
fig, ax = plt.subplots(figsize=(5.5, 5.5)); repere(ax, -3, 4, -3, 7)
x = np.linspace(-3, 3, 50); ax.plot(x, 2 * x + 1, color=ACCENT, lw=2.5)
ax.plot([0, 2], [1, 5], "o", color=ACCENT2, ms=7, zorder=5)
ax.text(2.2, 5, "(d)", color=ACCENT, fontsize=13, weight="bold")
save(fig, "q01-droite")

# Q2 — parabole f(x) = x² − 4x + 3
fig, ax = plt.subplots(figsize=(5.5, 5.5)); repere(ax, -1, 5, -2, 6)
x = np.linspace(-0.6, 4.6, 200); ax.plot(x, x**2 - 4*x + 3, color=ACCENT, lw=2.5)
ax.text(4.1, 4.2, "Cf", color=ACCENT, fontsize=14, weight="bold", style="italic")
save(fig, "q02-parabole")

# Q3 — diagramme en barres : livres vendus
fig, ax = plt.subplots(figsize=(6.5, 4.2))
jours, ventes = ["Lun", "Mar", "Mer", "Jeu", "Ven"], [4, 7, 5, 9, 5]
bars = ax.bar(jours, ventes, color=ACCENT, width=0.6, zorder=3)
ax.set_yticks(range(0, 11)); ax.set_ylim(0, 10); ax.grid(axis="y", color=GRID, zorder=0)
ax.set_ylabel("Livres vendus"); ax.set_title("Ventes de la librairie", fontsize=13, weight="bold")
for s in ("right", "top"): ax.spines[s].set_visible(False)
save(fig, "q03-barres")

# Q4 — diagramme circulaire : moyen de transport de 40 élèves
fig, ax = plt.subplots(figsize=(5.8, 4.6))
parts, labels = [50, 25, 15, 10], ["Bus 50 %", "Vélo 25 %", "Voiture 15 %", "À pied 10 %"]
ax.pie(parts, labels=labels, colors=[ACCENT, "#22a06b", "#f59e0b", ACCENT2], startangle=90,
       counterclock=False, wedgeprops={"edgecolor": "white", "linewidth": 2}, textprops={"fontsize": 12})
ax.set_title("Moyen de transport des 40 élèves", fontsize=13, weight="bold"); ax.set_aspect("equal")
save(fig, "q04-camembert")

# Q5 — triangle rectangle 3-4-?
fig, ax = plt.subplots(figsize=(5.2, 4.2)); ax.set_aspect("equal"); ax.axis("off")
A, B, C = (0, 0), (4, 0), (0, 3)
ax.add_patch(Polygon([A, B, C], closed=True, fc="#eef0ff", ec=ACCENT, lw=2.5))
ax.add_patch(Polygon([(0, 0), (0.35, 0), (0.35, 0.35), (0, 0.35)], closed=True, fc="none", ec=INK, lw=1.5))
ax.text(-0.2, -0.2, "A", fontsize=14, weight="bold", ha="right", va="top")
ax.text(4.15, -0.2, "B", fontsize=14, weight="bold", va="top")
ax.text(-0.2, 3.1, "C", fontsize=14, weight="bold", ha="right")
ax.text(2, -0.3, "4 cm", ha="center", va="top", fontsize=13)
ax.text(-0.3, 1.5, "3 cm", ha="right", va="center", fontsize=13)
ax.text(2.25, 1.75, "?", fontsize=18, weight="bold", color=ACCENT2)
ax.set_xlim(-1, 5); ax.set_ylim(-0.9, 3.6)
save(fig, "q05-triangle")

# Q6 — points dans un repère
fig, ax = plt.subplots(figsize=(5.5, 5.5)); repere(ax, -4, 4, -4, 4)
for name, (px, py), dx, dy in [("A", (2, 3), 0.2, 0.15), ("B", (-1, 2), -0.55, 0.15), ("C", (3, -2), 0.2, 0.15)]:
    ax.plot(px, py, "o", color=ACCENT2, ms=8, zorder=5)
    ax.text(px + dx, py + dy, name, fontsize=14, weight="bold", color=ACCENT2)
save(fig, "q06-points")

# Q7 — droite décroissante y = −x + 4
fig, ax = plt.subplots(figsize=(5.5, 5.5)); repere(ax, -2, 6, -2, 6)
x = np.linspace(-1.5, 5.5, 50); ax.plot(x, -x + 4, color=ACCENT, lw=2.5)
ax.text(4.6, -1.3, "Cf", color=ACCENT, fontsize=14, weight="bold", style="italic")
save(fig, "q07-decroissante")

# Q8 — aire d'un rectangle
fig, ax = plt.subplots(figsize=(5.4, 3.4)); ax.set_aspect("equal"); ax.axis("off")
ax.add_patch(Polygon([(0, 0), (6, 0), (6, 2.5), (0, 2.5)], closed=True, fc="#eef0ff", ec=ACCENT, lw=2.5))
ax.text(3, -0.3, "6 cm", ha="center", va="top", fontsize=13)
ax.text(6.3, 1.25, "2,5 cm", va="center", fontsize=13)
ax.set_xlim(-0.5, 8); ax.set_ylim(-1, 3)
save(fig, "q08-rectangle")
print("ok")
