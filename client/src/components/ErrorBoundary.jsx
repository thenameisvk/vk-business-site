import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('💥 UI crash caught by ErrorBoundary:', error);
    console.error(info?.componentStack);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (this.state.error) {
      return (
        <div className="adm-page">
          <div className="adm-page-inner">
            <div
              className="adm-card"
              style={{ padding: 32, textAlign: 'center', maxWidth: 560, margin: '60px auto' }}
            >
              <i
                className="bi bi-exclamation-octagon-fill"
                style={{ fontSize: '2.5rem', color: '#ff0033' }}
              />
              <h2 style={{ marginTop: 12 }}>Something went wrong</h2>
              <p style={{ color: '#b0b0bd', marginBottom: 20 }}>
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <button className="adm-btn adm-btn--primary" onClick={this.reset}>
                  <i className="bi bi-arrow-clockwise" /> Try again
                </button>
                <button className="adm-btn" onClick={() => window.location.reload()}>
                  <i className="bi bi-arrow-repeat" /> Reload page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}