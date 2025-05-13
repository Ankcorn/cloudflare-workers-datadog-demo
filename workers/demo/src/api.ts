import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { randomUUID } from 'node:crypto';
import { Metrics } from './metrics'
/**
 * Todo item type that matches the database schema
 */
export type Todo = {
	id?: number;
	user_id: string;
	title: string;
	description?: string;
	is_completed: boolean;
	priority: 'low' | 'medium' | 'high';
	due_date?: string;
	created_at?: string;
	updated_at?: string;
};

/**
 * Todo creation request type
 */
export type TodoCreationRequest = Omit<Todo, 'id' | 'created_at' | 'updated_at' | 'is_completed'> & {
	is_completed?: boolean;
};

const app = new Hono<{ Bindings: Env; Variables: { session: string } }>();

app.use('*', async (c, next) => {
	const metrics = new Metrics();
	const cookie = getCookie(c, 'session');
	if (!cookie) {
		const session = randomUUID();
		 setCookie(c, 'session', session, {
			maxAge: 60 * 60 * 24 * 7, // 1 week
		});

		c.set('session', session);
		console.info('New user session created:', { session });
		metrics.addTag('session', session);
		metrics.gauge('session.created', 1);
		await next();
		return
	}

	c.set('session', cookie as string);
	metrics.addTag('session', cookie as string);
	metrics.gauge('session.reused', 1);
	console.info('Existing user session used', { cookie });
	await next();
	return
});

app.get('/', async (c) => {
	const session = c.get('session');

	// Fetch todos for the current user session
	const { results: todos } = await c.env.DB.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC')
		.bind(session)
		.all<Todo>();

	console.log('Fetched todos:', { todos, session });

	// HTML template for the todo list UI with Tailwind CSS
	const html = `
	<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Todo App</title>
		<script src="https://cdn.tailwindcss.com"></script>
		<script>
			tailwind.config = {
				theme: {
					extend: {
						colors: {
							low: '#60A5FA',
							medium: '#F59E0B',
							high: '#EF4444'
						}
					}
				}
			}
		</script>
	</head>
	<body class="bg-gray-100 min-h-screen p-6 font-sans">
		<div class="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow-md">
			<h1 class="text-3xl font-bold text-center text-gray-800 mb-6">Todo List</h1>

			<div class="mb-8 bg-gray-50 p-4 rounded-md">
				<form action="/todos" method="POST" class="space-y-4">
					<div class="space-y-1">
						<label for="title" class="block text-sm font-medium text-gray-700">Title:</label>
						<input type="text" id="title" name="title" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
					</div>

					<div class="space-y-1">
						<label for="description" class="block text-sm font-medium text-gray-700">Description:</label>
						<textarea id="description" name="description" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
					</div>

					<div class="flex flex-wrap gap-4">
						<div class="space-y-1 flex-1 min-w-[120px]">
							<label for="priority" class="block text-sm font-medium text-gray-700">Priority:</label>
							<select id="priority" name="priority" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
								<option value="low">Low</option>
								<option value="medium" selected>Medium</option>
								<option value="high">High</option>
							</select>
						</div>

						<div class="space-y-1 flex-1 min-w-[150px]">
							<label for="due_date" class="block text-sm font-medium text-gray-700">Due Date:</label>
							<input type="date" id="due_date" name="due_date" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
						</div>
					</div>

					<button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-150 ease-in-out">Add Todo</button>
				</form>
			</div>

			<h2 class="text-2xl font-semibold text-gray-700 mb-4">Your Todos</h2>
			<ul class="space-y-3">
				${
					todos && todos.length > 0
						? todos
								.map(
									(todo) => `
					<li class="border rounded-lg overflow-hidden shadow-sm ${todo.is_completed ? 'bg-gray-50' : 'bg-white'}">
						<div class="flex items-center p-4">
							<form action="/todos/${todo.id}/toggle" method="POST" class="mr-3">
								<input type="checkbox" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
									${todo.is_completed ? 'checked' : ''}
									onChange="this.form.submit()">
							</form>
							<div class="flex-grow ${todo.is_completed ? 'line-through text-gray-500' : ''}">
								<h3 class="font-medium text-lg">${todo.title}</h3>
								${todo.description ? `<p class="text-gray-600 mt-1">${todo.description}</p>` : ''}
								<div class="flex flex-wrap gap-2 mt-2">
									<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
										todo.priority === 'low'
											? 'bg-blue-100 text-blue-800'
											: todo.priority === 'medium'
												? 'bg-yellow-100 text-yellow-800'
												: 'bg-red-100 text-red-800'
									}">
										${todo.priority}
									</span>
									${todo.due_date ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Due: ${todo.due_date}</span>` : ''}
								</div>
							</div>
							<form action="/todos/${todo.id}/delete" method="POST">
								<button type="submit" class="ml-2 inline-flex items-center p-1.5 border border-transparent rounded-full text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
									</svg>
								</button>
							</form>
						</div>
					</li>
				`
								)
								.join('')
						: '<li class="text-center py-8 text-gray-500">No todos yet! Add one above.</li>'
				}
			</ul>
		</div>
	</body>
	</html>
	`;

	return c.html(html);
});

app.post('/todos', async (c) => {
	const session = c.get('session');
	const formData = await c.req.parseBody();

	// Create new todo
	try {
		await c.env.DB.prepare(
			`
			INSERT INTO todos (user_id, title, description, priority, due_date)
			VALUES (?, ?, ?, ?, ?)
		`
		)
			.bind(session, formData.title, formData.description || null, formData.priority || 'medium', formData.due_date || null)
			.run();

		return c.redirect('/');
	} catch (error) {
		console.error('Failed to create todo:', error);
		return c.text('Error creating todo', 500);
	}
});

// Toggle todo completion status
app.post('/todos/:id/toggle', async (c) => {
	const session = c.get('session');
	const todoId = c.req.param('id');

	try {
		await c.env.DB.prepare(
			`
			UPDATE todos
			SET is_completed = NOT is_completed,
				updated_at = datetime('now')
			WHERE id = ? AND user_id = ?
		`
		)
			.bind(todoId, session)
			.run();

		return c.redirect('/');
	} catch (error) {
		console.error('Failed to toggle todo status:', error);
		return c.text('Error updating todo', 500);
	}
});

// Delete a todo
app.post('/todos/:id/delete', async (c) => {
	const session = c.get('session');
	const todoId = c.req.param('id');

	try {
		await c.env.DB.prepare(
			`
			DELETE FROM todos
			WHERE id = ? AND user_id = ?
		`
		)
			.bind(todoId, session)
			.run();

		return c.redirect('/');
	} catch (error) {
		console.error('Failed to delete todo:', error);
		return c.text('Error deleting todo', 500);
	}
});

export default app;
