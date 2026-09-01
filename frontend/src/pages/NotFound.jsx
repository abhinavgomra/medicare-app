import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HomeIcon } from '@heroicons/react/24/outline';
import { Button } from '../components/Button';

const NotFound = () => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        {/* Large 404 */}
        <div className="relative mb-6">
          <div className="text-[10rem] font-black leading-none text-transparent bg-clip-text bg-gradient-to-br from-primary-400 to-secondary-500 select-none">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 bg-primary-100 rounded-full blur-3xl opacity-60" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-3">Page not found</h1>
        <p className="text-slate-500 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/">
            <Button size="lg" className="w-full sm:w-auto gap-2">
              <HomeIcon className="h-5 w-5" />
              Go Home
            </Button>
          </Link>
          <Link to="/doctor-finder">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto">
              Find a Doctor
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
