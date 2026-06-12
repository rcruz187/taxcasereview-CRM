import { Component } from 'react'

// Catches render errors in a child component and shows them visibly
// instead of silently producing a blank screen.
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
    return this.props.children
  }
}
