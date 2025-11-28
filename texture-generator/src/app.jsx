import { lazy, LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';

import Landing from './pages/Landing';
const Generator = lazy(() => import('./pages/Generator'));

export const App = () => (
	<LocationProvider scope="/NexiiText5/">
		<ErrorBoundary>
			<Router>
				<Route path="/NexiiText5/" component={Landing}/>
				<Route path="/NexiiText5/generator" component={Generator}/>
			</Router>
		</ErrorBoundary>
	</LocationProvider>
);