import * as React from 'react';
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'

import {IndexView, DetailView} from './app.jsx'

const root = ReactDOMClient.createRoot(document.getElementById('react-root'));
root.render(<IndexView />)

