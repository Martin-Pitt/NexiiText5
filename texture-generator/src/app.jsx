import { lazy, LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';

import Landing from './pages/Landing';
const Generator = lazy(() => import('./pages/Generator'));

export const App = () => (
	<LocationProvider>
		<ErrorBoundary>
			<Router>
				<Route path="/" component={Landing}/>
				<Route path="/generator" component={Generator}/>
			</Router>
		</ErrorBoundary>
	</LocationProvider>
);