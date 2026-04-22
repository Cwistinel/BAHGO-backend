import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import pickle

# ===== LOAD DATA =====
df = pd.read_csv('bahgo_training_data.csv')

# For linear regression, predict water_level (continuous) from precipitation and rise_rate
X = df[['precipitation', 'rise_rate']]
y = df['water_level']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

model = LinearRegression()
model.fit(X_train_scaled, y_train)

y_pred = model.predict(X_test_scaled)

# ===== RESIDUAL PLOT =====
residuals = y_test - y_pred

plt.figure(figsize=(10, 6))
plt.scatter(y_pred, residuals, color='red', alpha=0.5, edgecolors='darkred', s=40)
plt.axhline(y=0, color='blue', linestyle='--', linewidth=2)
plt.xlabel('Predicted Water Level', fontsize=12)
plt.ylabel('Residuals (Actual - Predicted)', fontsize=12)
plt.title('Residual Plot - Linear Regression for Water Level', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig('residual_plot.png')
plt.show()

# ===== SAVE MODEL =====
with open('bahgo_linear_model.pkl', 'wb') as f:
    pickle.dump(model, f)
with open('bahgo_scaler.pkl', 'wb') as f:
    pickle.dump(scaler, f)

print("Linear regression model and plot saved!")