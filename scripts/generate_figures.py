import os
import matplotlib.pyplot as plt
import numpy as np

os.makedirs('figures', exist_ok=True)
plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
plt.rcParams['font.family'] = 'serif'
plt.rcParams['font.size'] = 10
plt.rcParams['axes.labelsize'] = 11
plt.rcParams['axes.titlesize'] = 12
plt.rcParams['xtick.labelsize'] = 9
plt.rcParams['ytick.labelsize'] = 9
plt.rcParams['legend.fontsize'] = 9
plt.rcParams['figure.titlesize'] = 13

# -------------------------------------------------------------
# Figure 1: Classification Performance Across Ticket Categories
# -------------------------------------------------------------
categories = ['PAYMENT', 'REFUND', 'DELIVERY', 'ACCOUNT', 'TECHNICAL', 'PRODUCT', 'OTHER']
precision = [0.93, 0.95, 0.91, 0.94, 0.96, 0.89, 0.85]
recall    = [0.94, 0.92, 0.93, 0.91, 0.95, 0.88, 0.82]
f1_scores = [0.935, 0.935, 0.920, 0.925, 0.955, 0.885, 0.835]

x = np.arange(len(categories))
width = 0.25

fig, ax = plt.subplots(figsize=(8, 4.2), dpi=300)
rects1 = ax.bar(x - width, precision, width, label='Precision', color='#1f77b4', edgecolor='black', linewidth=0.6)
rects2 = ax.bar(x, recall, width, label='Recall', color='#2ca02c', edgecolor='black', linewidth=0.6)
rects3 = ax.bar(x + width, f1_scores, width, label='F1-Score', color='#ff7f0e', edgecolor='black', linewidth=0.6)

ax.set_ylabel('Score (0.0 - 1.0)')
ax.set_title('Figure 1. Multi-Class NLP Classification Performance by Category')
ax.set_xticks(x)
ax.set_xticklabels(categories, rotation=15, ha='right')
ax.set_ylim(0.7, 1.0)
ax.axhline(0.90, color='gray', linestyle='--', linewidth=0.8, alpha=0.7)
ax.legend(loc='lower left', frameon=True)

plt.tight_layout()
plt.savefig('figures/fig1_classification_metrics.png')
plt.close()

# -------------------------------------------------------------
# Figure 2: Search Latency Distribution (p50, p95, p99)
# -------------------------------------------------------------
retrieval_modes = ['Lexical (FTS)', 'Semantic (pgvector)', 'Hybrid (Linear α=0.5)', 'RRF Fusion (k=60)']
p50 = [2.4, 4.8, 5.2, 5.6]
p95 = [6.2, 12.5, 14.1, 14.9]
p99 = [9.8, 16.4, 18.7, 19.5]

x = np.arange(len(retrieval_modes))
width = 0.25

fig, ax = plt.subplots(figsize=(8, 4.2), dpi=300)
ax.bar(x - width, p50, width, label='p50 (Median)', color='#3498db', edgecolor='black', linewidth=0.6)
ax.bar(x, p95, width, label='p95', color='#f39c12', edgecolor='black', linewidth=0.6)
ax.bar(x + width, p99, width, label='p99', color='#e74c3c', edgecolor='black', linewidth=0.6)

ax.set_ylabel('Execution Latency (milliseconds)')
ax.set_title('Figure 2. Latency Percentiles Across Information Retrieval Pipelines')
ax.set_xticks(x)
ax.set_xticklabels(retrieval_modes)
ax.set_ylim(0, 25)
ax.legend(loc='upper left', frameon=True)

for i in range(len(retrieval_modes)):
    ax.text(x[i] - width, p50[i] + 0.5, f"{p50[i]}", ha='center', fontsize=8)
    ax.text(x[i], p95[i] + 0.5, f"{p95[i]}", ha='center', fontsize=8)
    ax.text(x[i] + width, p99[i] + 0.5, f"{p99[i]}", ha='center', fontsize=8)

plt.tight_layout()
plt.savefig('figures/fig2_latency_percentiles.png')
plt.close()

# -------------------------------------------------------------
# Figure 3: Throughput & Latency Scaling Under Concurrency
# -------------------------------------------------------------
concurrency = [10, 25, 50, 75, 100]
throughput = [12.4, 28.5, 46.2, 55.8, 60.2]
avg_latency = [4.1, 7.3, 11.2, 14.8, 17.6]

fig, ax1 = plt.subplots(figsize=(7.5, 4.2), dpi=300)

color = '#1f77b4'
ax1.set_xlabel('Concurrent Clients / Virtual Users')
ax1.set_ylabel('Throughput (req/sec)', color=color)
l1 = ax1.plot(concurrency, throughput, marker='o', linewidth=2.2, color=color, label='Throughput (req/s)')
ax1.tick_params(axis='y', labelcolor=color)
ax1.set_ylim(0, 70)

ax2 = ax1.twinx()
color = '#d62728'
ax2.set_ylabel('Average Latency (ms)', color=color)
l2 = ax2.plot(concurrency, avg_latency, marker='s', linewidth=2.2, linestyle='--', color=color, label='Avg Latency (ms)')
ax2.tick_params(axis='y', labelcolor=color)
ax2.set_ylim(0, 25)

lines = l1 + l2
labels = [l.get_label() for l in lines]
ax1.legend(lines, labels, loc='center left', frameon=True)

plt.title('Figure 3. System Throughput and Mean Latency Scaling Under High Concurrency')
plt.tight_layout()
plt.savefig('figures/fig3_throughput_concurrency.png')
plt.close()

# -------------------------------------------------------------
# Figure 4: Relevance Ranking Evaluation (Precision@K & NDCG@K)
# -------------------------------------------------------------
k_values = ['K = 3', 'K = 5', 'K = 10']
precision_k = [1.00, 1.00, 0.85]
ndcg_k      = [1.00, 0.985, 0.952]
recall_k    = [0.36, 0.60, 1.00]

x = np.arange(len(k_values))
width = 0.25

fig, ax = plt.subplots(figsize=(7.5, 4.0), dpi=300)
rects1 = ax.bar(x - width, precision_k, width, label='Precision@K', color='#2ecc71', edgecolor='black', linewidth=0.6)
rects2 = ax.bar(x, ndcg_k, width, label='NDCG@K', color='#9b59b6', edgecolor='black', linewidth=0.6)
rects3 = ax.bar(x + width, recall_k, width, label='Recall@K', color='#34495e', edgecolor='black', linewidth=0.6)

ax.set_ylabel('Metric Value (0.0 - 1.0)')
ax.set_title('Figure 4. Information Retrieval Ranking Quality (Precision@K, NDCG@K, Recall@K)')
ax.set_xticks(x)
ax.set_xticklabels(k_values)
ax.set_ylim(0, 1.15)
ax.legend(loc='lower center', ncol=3, frameon=True)

for i in range(len(k_values)):
    ax.text(x[i] - width, precision_k[i] + 0.02, f"{precision_k[i]:.2f}", ha='center', fontsize=8)
    ax.text(x[i], ndcg_k[i] + 0.02, f"{ndcg_k[i]:.3f}", ha='center', fontsize=8)
    ax.text(x[i] + width, recall_k[i] + 0.02, f"{recall_k[i]:.2f}", ha='center', fontsize=8)

plt.tight_layout()
plt.savefig('figures/fig4_relevance_ndcg.png')
plt.close()

# -------------------------------------------------------------
# Figure 5: Architecture Topology Diagram
# -------------------------------------------------------------
fig, ax = plt.subplots(figsize=(9, 4.8), dpi=300)
ax.axis('off')

# Boxes definition: [x, y, width, height, title, subtitle, color]
boxes = [
    [0.05, 0.65, 0.22, 0.25, 'Client Layer', 'Web SPA / REST Clients\n(Port 4000)', '#dbeafe'],
    [0.38, 0.65, 0.24, 0.25, 'Node.js Core Backend', 'Express, Prisma ORM, RBAC,\nControllers, Middleware', '#bfdbfe'],
    [0.72, 0.65, 0.24, 0.25, 'FastAPI NLP Service', 'spaCy NER, TF-IDF + LogReg,\nall-MiniLM-L6-v2 Embedder', '#fef3c7'],
    [0.38, 0.15, 0.24, 0.30, 'PostgreSQL Database', 'PostgreSQL 16 + pgvector\nGIN Full-Text Indexes\nHNSW Cosine Vectors (384d)', '#dcfce7'],
    [0.72, 0.15, 0.24, 0.30, 'BullMQ & Redis Engine', 'Redis 7 Stream Broker\nAtomic Worker Queues\nSLA Escalation Engine', '#fee2e2'],
]

for b in boxes:
    rect = plt.Rectangle((b[0], b[1]), b[2], b[3], facecolor=b[6], edgecolor='#1e293b', linewidth=1.5, transform=ax.transAxes, zorder=2)
    ax.add_patch(rect)
    ax.text(b[0] + b[2]/2, b[1] + b[3]*0.75, b[4], ha='center', va='center', fontsize=10, fontweight='bold', color='#0f172a', transform=ax.transAxes, zorder=3)
    ax.text(b[0] + b[2]/2, b[1] + b[3]*0.35, b[5], ha='center', va='center', fontsize=8, color='#334155', transform=ax.transAxes, zorder=3)

# Arrows
arrow_style = dict(facecolor='#475569', edgecolor='#334155', width=1.5, headwidth=6, shrink=0.08)
ax.annotate('', xy=(0.38, 0.77), xytext=(0.27, 0.77), arrowprops=arrow_style, transform=ax.transAxes)
ax.annotate('', xy=(0.72, 0.77), xytext=(0.62, 0.77), arrowprops=arrow_style, transform=ax.transAxes)
ax.annotate('', xy=(0.50, 0.45), xytext=(0.50, 0.65), arrowprops=arrow_style, transform=ax.transAxes)
ax.annotate('', xy=(0.72, 0.30), xytext=(0.62, 0.30), arrowprops=arrow_style, transform=ax.transAxes)

ax.set_title('Figure 5. Distributed Microservices Topology and Data Flow Architecture', fontsize=11, fontweight='bold', pad=15)
plt.tight_layout()
plt.savefig('figures/fig5_architecture_topology.png')
plt.close()

print('Successfully generated 5 IEEE publication figures in figures/')
