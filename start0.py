import webbrowser
import os

# Get the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))

# Path to the index.html file in the frontend directory
html_path = os.path.join(script_dir, 'frontend', 'index.html')

# Open the HTML file in the default web browser
webbrowser.open('file://' + os.path.abspath(html_path))