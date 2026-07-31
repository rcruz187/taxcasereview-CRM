import { Component } from 'react'

// Catches render errors in a child component and shows them visibly
// instead of silently producing a blank screen.
// When onClose is provided → shows a modal overlay (for top-level use).
// When no onClose → shows a compact inline error (for embedded use).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      if (this.props.onClose) {
        // Full modal — used for top-level things like IRSFormFiller
        return (
          <div className="modal-bg open">
            <div className="modal" style={{ width: 480 }}>
              <div className="mh">
                <span className="mt">⚠️ Something went wrong</span>
                <button className="xbtn" onClick={() => { this.setState({ error: null }); this.props.onClose?.() }}>&times;</button>
              </div>
              <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--bad)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {this.state.error.message || String(this.state.error)}
              </div>
              <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                onClick={() => { this.setState({ error: null }); this.props.onClose?.() }}>
                Close
              </button>
            </div>
          </div>
        )
      }
      // Inline — used inside tabs/embedded components so the rest of the page stays intact
      return (
        <div style={{ padding: '12px 16px', background: 'rgba(192,32,47,.08)', border: '1px solid var(--bad)', borderRadius: 8, margin: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bad)', marginBottom: 6 }}>⚠️ Something went wrong</div>
          <div style={{ fontSize: 12, color: 'var(--bad)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
            {this.state.error.message || String(this.state.error)}
          </div>
          <button className="btn sec" style={{ fontSize: 12 }}
            onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
