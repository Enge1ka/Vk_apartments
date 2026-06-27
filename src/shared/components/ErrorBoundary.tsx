import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logMetric } from '@/features/monitoring/api'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info)
    logMetric({
      metricType: 'error',
      metricName: error.name || 'Error',
      value: 1,
      path: window.location.pathname,
      metadata: { message: error.message, stack: error.stack, componentStack: info.componentStack },
    })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-center">
            <h1 className="text-lg font-bold text-gray-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-gray-600">
              Please reload the page. If the problem continues, contact support.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-xl bg-[#1e3a5f] text-white py-2.5 text-sm font-medium"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
